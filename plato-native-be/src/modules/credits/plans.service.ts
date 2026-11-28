import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import {
  ejDate,
  num,
  type Range,
  round,
  str,
  sumBy,
  tokensSpentBy,
  usageGroups,
} from '../usage/usage-stats';
import {
  allPlans,
  allTopups,
  setCatalog,
  USD_PER_TOKEN,
} from './credit-prices';

export const planCreateSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,20}$/),
  kind: z.enum(['plan', 'topup']),
  label: z.string().trim().min(1).max(40),
  tokens: z.number().finite().min(0).max(10_000_000),
  priceUsd: z.number().finite().min(0).max(100_000),
  active: z.boolean().default(true),
});
export const planPatchSchema = planCreateSchema
  .pick({ label: true, tokens: true, priceUsd: true, active: true })
  .partial();

type Row = {
  key: string;
  kind: string;
  label: string;
  tokens: number;
  price_usd: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

const percentile = (sorted: number[], p: number) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
    : 0;

// Plans and top-ups: the defaults in credit-prices.ts with the plans collection over
// them. The live catalog is an in-memory copy (credit-prices.ts setCatalog), loaded
// at boot and after every write here, so a charge or a checkout never reads the DB for it.
// Every instance reloads its copy each minute, so an edit on one reaches the others within a minute.
@Injectable()
export class PlansService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlansService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.load().catch((e: Error) =>
      this.logger.warn(`plans not loaded, using the defaults: ${e.message}`),
    );
    // another API instance's edit reaches this one within a minute (each keeps its own copy)
    this.timer = setInterval(
      () => void this.load().catch(() => undefined),
      60_000,
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private rows(): Promise<Row[]> {
    return this.prisma.plan.findMany();
  }

  async load() {
    setCatalog(await this.rows());
  }

  /** Every plan and pack: a stored row, or its default (createdAt/updatedAt null). */
  async list() {
    const rows = await this.rows();
    setCatalog(rows);
    const stored = new Map(rows.map((r) => [r.key, r]));
    const plans = allPlans();
    const topups = allTopups();
    const out = [
      ...Object.entries(plans).map(([key, p]) => ({
        key,
        kind: 'plan',
        label: p.label,
        tokens: p.monthly,
        priceUsd: p.priceUsd,
        active: p.active,
      })),
      ...Object.entries(topups).map(([key, t]) => ({
        key,
        kind: 'topup',
        label: t.label,
        tokens: t.tokens,
        priceUsd: t.priceUsd,
        active: t.active,
      })),
    ].map((p) => ({
      ...p,
      createdAt: stored.get(p.key)?.created_at ?? null,
      updatedAt: stored.get(p.key)?.updated_at ?? null,
    }));
    return { items: out, usdPerToken: USD_PER_TOKEN };
  }

  private async one(key: string) {
    const all = await this.list();
    const p = all.items.find((i) => i.key === key);
    if (!p) throw new NotFoundException('No such plan');
    return p;
  }

  async create(body: unknown) {
    const p = planCreateSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    const d = p.data;
    if (d.key in allPlans() || d.key in allTopups())
      throw new ConflictException('A plan or pack with this key exists');
    try {
      await this.prisma.plan.create({
        data: {
          key: d.key,
          kind: d.kind,
          label: d.label,
          tokens: d.tokens,
          price_usd: d.priceUsd,
          active: d.active,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('A plan or pack with this key exists');
      throw e;
    }
    return this.one(d.key);
  }

  async update(key: string, body: unknown) {
    const p = planPatchSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues);
    const cur = await this.one(key);
    if (
      key === 'free' &&
      ((p.data.priceUsd ?? 0) !== 0 || p.data.active === false)
    )
      throw new BadRequestException('Free stays free and on.');
    await this.write(key, cur, {
      ...(p.data.label !== undefined && { label: p.data.label }),
      ...(p.data.tokens !== undefined && { tokens: p.data.tokens }),
      ...(p.data.priceUsd !== undefined && { price_usd: p.data.priceUsd }),
      ...(p.data.active !== undefined && { active: p.data.active }),
    });
    return this.one(key);
  }

  /** Switched off, not removed: it can't be bought, accounts on it keep working. */
  async remove(key: string) {
    if (key === 'free')
      throw new BadRequestException('Free cannot be deleted.');
    const cur = await this.one(key);
    await this.write(key, cur, { active: false });
    return { ok: true };
  }

  // A default key gets its row on its first edit, starting from the default's values.
  private async write(
    key: string,
    cur: {
      kind: string;
      label: string;
      tokens: number;
      priceUsd: number;
      active: boolean;
    },
    data: Partial<Pick<Row, 'label' | 'tokens' | 'price_usd' | 'active'>>,
  ) {
    await this.prisma.plan.upsert({
      where: { key },
      create: {
        key,
        kind: cur.kind,
        label: cur.label,
        tokens: cur.tokens,
        price_usd: cur.priceUsd,
        active: cur.active,
        ...data,
      },
      update: data,
    });
    await this.load();
  }

  /** Real usage per plan and feature in the range: what the panel's price calculator works from. */
  async calculator(range: Range) {
    const [accounts, spent, perUser, all, ledgerByFeature] = await Promise.all([
      // ponytail: every account in memory; fine to ~100k seekers, then aggregate per plan in Mongo
      this.prisma.creditAccount.findMany({
        select: { user_id: true, plan: true },
      }),
      tokensSpentBy(this.prisma, range),
      usageGroups(this.prisma, range, ['user']),
      usageGroups(this.prisma, range, ['feature']),
      this.prisma.creditLedger.aggregateRaw({
        pipeline: [
          {
            $match: {
              kind: 'consume',
              created_at: { $gte: ejDate(range.from), $lt: ejDate(range.to) },
            },
          },
          {
            $group: {
              _id: '$feature',
              tokens: { $sum: '$amount' },
              n: { $sum: 1 },
            },
          },
        ],
      }) as unknown as Promise<{ _id: unknown; tokens: unknown; n: unknown }[]>,
    ]);
    const costOf = new Map<string, number>();
    for (const r of perUser)
      if (r.userId)
        costOf.set(r.userId, (costOf.get(r.userId) ?? 0) + r.costUsd);
    const byPlan = new Map<string, string[]>();
    for (const a of accounts)
      byPlan.set(a.plan, [...(byPlan.get(a.plan) ?? []), a.user_id]);
    const keys = new Set([...Object.keys(allPlans()), ...byPlan.keys()]);
    const plans = [...keys].map((key) => {
      const users = byPlan.get(key) ?? [];
      const used = users.map((u) => spent.get(u) ?? 0).sort((a, b) => a - b);
      const cost = users.reduce((s, u) => s + (costOf.get(u) ?? 0), 0);
      return {
        key,
        users: users.length,
        avgTokensUsed: users.length
          ? round(used.reduce((s, n) => s + n, 0) / users.length, 1)
          : 0,
        p50TokensUsed: round(percentile(used, 0.5), 1),
        p90TokensUsed: round(percentile(used, 0.9), 1),
        avgCostUsd: users.length ? round(cost / users.length) : 0,
      };
    });
    const charged = new Map(
      ledgerByFeature.map((r) => [
        str(r._id) ?? '',
        { tokens: -num(r.tokens), n: num(r.n) },
      ]),
    );
    const usage = new Map(
      sumBy(all, 'feature', (r) => r.feature ?? '').map((f) => [f.feature, f]),
    );
    const perFeature = [...new Set([...charged.keys(), ...usage.keys()])]
      .filter(Boolean)
      .map((feature) => {
        const c = charged.get(feature);
        const u = usage.get(feature);
        return {
          feature,
          avgTokensPerEvent: c?.n ? round(c.tokens / c.n, 2) : 0,
          avgCostUsdPerEvent: u?.events ? round(u.costUsd / u.events) : 0,
        };
      })
      .sort((a, b) => b.avgCostUsdPerEvent - a.avgCostUsdPerEvent);
    const providers = sumBy(all, 'provider', (r) => r.provider);
    const total = providers.reduce((s, p) => s + p.costUsd, 0);
    return {
      usdPerToken: USD_PER_TOKEN,
      plans,
      perFeature,
      providerCostShare: providers.map((p) => ({
        provider: p.provider,
        share: total ? round(p.costUsd / total, 4) : 0,
      })),
    };
  }
}
