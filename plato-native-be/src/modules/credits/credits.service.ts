import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURE_LABELS,
  PLANS,
  planOf,
  TOPUPS,
  tokensFor,
  type MeteredRow,
} from './credit-prices';
import { InsufficientTokensException } from './insufficient-tokens.exception';

const addMonth = (d: Date) => {
  const n = new Date(d);
  n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
};
// What is left of the bought tokens: they are spent last, so min(topup, balance).
const keptTopup = (acc: { topup?: number | null; balance: number }) =>
  Math.max(0, Math.min(acc.topup ?? 0, acc.balance));
const shown = (n: number) => Math.round(n * 10) / 10;

export type CheckoutItem = { plan: 'pro' | 'max' } | { pack: string };

// Plato tokens: accounts, charges, reservations, top-ups and plan changes.
// Everything that changes a balance goes through here and writes the ledger.
@Injectable()
export class CreditsService implements OnModuleInit {
  private readonly logger = new Logger(CreditsService.name);
  // The one door for code outside Nest's DI: recordUsage() (usage.ts) is a plain
  // function called from ~20 places, so it reaches the charge through this.
  static instance?: CreditsService;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    CreditsService.instance = this;
  }

  /**
   * The seeker's account, created with the plan's grant on first use and reset to
   * the grant when its period has ended (no cron: the next read or charge does it).
   * Unused monthly tokens do not roll over; bought ones do.
   */
  async account(userId: string, now = new Date()) {
    let acc = await this.prisma.creditAccount.findUnique({
      where: { user_id: userId },
    });
    if (!acc) {
      const grant = planOf('free').monthly;
      try {
        acc = await this.prisma.creditAccount.create({
          data: {
            user_id: userId,
            plan: 'free',
            balance: grant,
            period_start: now,
            period_end: addMonth(now),
          },
        });
        await this.prisma.creditLedger.create({
          data: {
            user_id: userId,
            kind: 'grant',
            amount: grant,
            balance_after: grant,
            meta: { reason: 'plan', plan: 'free' },
          },
        });
      } catch (e) {
        // two first requests at once: the other one created it
        if (!(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ))
          throw e;
        acc = await this.prisma.creditAccount.findUniqueOrThrow({
          where: { user_id: userId },
        });
      }
    }
    if (now >= acc.period_end) {
      const grant = planOf(acc.plan).monthly;
      let start = acc.period_end;
      while (addMonth(start) <= now) start = addMonth(start); // a seeker away for months lands in the current period
      const kept = keptTopup(acc); // bought tokens never expire
      // conditional on the period we read: of two concurrent resets only one wins, so the grant is never doubled
      const won = await this.prisma.creditAccount.updateMany({
        where: { user_id: userId, period_end: acc.period_end },
        data: {
          balance: grant + kept,
          topup: kept,
          period_start: start,
          period_end: addMonth(start),
        },
      });
      if (won.count === 1)
        await this.prisma.creditLedger.create({
          data: {
            user_id: userId,
            kind: 'grant',
            amount: grant,
            balance_after: grant + kept,
            meta: {
              reason: 'monthly_reset',
              plan: acc.plan,
              previous_balance: acc.balance,
              topup_kept: kept,
            },
          },
        });
      acc = await this.prisma.creditAccount.findUniqueOrThrow({
        where: { user_id: userId },
      });
    }
    return acc;
  }

  /** Charge one metered usage event to its seeker. Never throws: metering must not break the feature it measures. */
  async charge(userId: string, row: MeteredRow, usageEventId?: string) {
    const amount = tokensFor(row);
    if (!amount) return;
    try {
      await this.account(userId);
      // an atomic $inc: concurrent charges never lose one another
      const acc = await this.prisma.creditAccount.update({
        where: { user_id: userId },
        data: { balance: { decrement: amount } },
      });
      await this.prisma.creditLedger.create({
        data: {
          user_id: userId,
          kind: 'consume',
          amount: -amount,
          balance_after: acc.balance,
          feature: row.feature,
          usage_event_id: usageEventId ?? null,
          ...(row.model && { meta: { model: row.model } }),
        },
      });
    } catch (e) {
      this.logger.warn(
        `charge not recorded (${row.feature}, user ${userId}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Refuse a paid action when the balance cannot cover `needed` tokens (default: anything left at all). */
  async require(userId: string, needed = 0) {
    const acc = await this.account(userId);
    if (acc.balance <= 0 || acc.balance < needed)
      throw new InsufficientTokensException(
        acc.balance,
        acc.period_end,
        needed || undefined,
      );
    return acc;
  }

  /** Reserve tokens before a call whose cost is known only after it. Returns the hold's ledger id. */
  async hold(
    userId: string,
    amount: number,
    feature: string,
    meta: Record<string, string | number>,
  ) {
    const acc = await this.prisma.creditAccount.update({
      where: { user_id: userId },
      data: { balance: { decrement: amount } },
    });
    const row = await this.prisma.creditLedger.create({
      // explicit null: on MongoDB a null filter does not match a missing field
      data: {
        user_id: userId,
        kind: 'hold',
        amount: -amount,
        balance_after: acc.balance,
        feature,
        settled_at: null,
        meta,
      },
    });
    return row.id;
  }

  /** Give a hold back, once (a second call is a no-op). The real cost is then charged as a normal usage event. */
  async release(userId: string, holdId: string) {
    const hold = await this.prisma.creditLedger.findFirst({
      where: { id: holdId, user_id: userId, kind: 'hold' },
    });
    if (!hold) return false;
    const won = await this.prisma.creditLedger.updateMany({
      where: { id: holdId, settled_at: null },
      data: { settled_at: new Date() },
    });
    if (won.count !== 1) return false;
    const acc = await this.prisma.creditAccount.update({
      where: { user_id: userId },
      data: { balance: { increment: -hold.amount } },
    });
    await this.prisma.creditLedger.create({
      data: {
        user_id: userId,
        kind: 'release',
        amount: -hold.amount,
        balance_after: acc.balance,
        feature: hold.feature,
        meta: { hold: holdId },
      },
    });
    return true;
  }

  /** The newest open voice reservation of one conversation, if any. */
  async openHold(userId: string, feature: string, thread: string) {
    const holds = await this.prisma.creditLedger.findMany({
      where: { user_id: userId, kind: 'hold', feature, settled_at: null },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    return (
      holds.find(
        (h) => (h.meta as { thread?: string } | null)?.thread === thread,
      ) ?? null
    );
  }

  /** Admin: add (or, negative, take away) tokens with a reason, in the ledger like everything else. */
  async adjust(userId: string, amount: number, reason: string) {
    await this.account(userId);
    const acc = await this.prisma.creditAccount.update({
      where: { user_id: userId },
      data: { balance: { increment: amount } },
    });
    await this.prisma.creditLedger.create({
      data: {
        user_id: userId,
        kind: 'adjust',
        amount,
        balance_after: acc.balance,
        meta: { reason },
      },
    });
    return acc;
  }

  /**
   * Admin (and later the payment webhook): move a seeker to a plan. A new period
   * starts now with the new plan's full grant, so an upgrade is usable at once;
   * bought tokens stay on top.
   */
  async setPlan(userId: string, plan: string, now = new Date()) {
    if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);
    const before = await this.account(userId, now);
    const grant = PLANS[plan].monthly;
    const kept = keptTopup(before);
    const acc = await this.prisma.creditAccount.update({
      where: { user_id: userId },
      data: {
        plan,
        balance: grant + kept,
        topup: kept,
        period_start: now,
        period_end: addMonth(now),
      },
    });
    await this.prisma.creditLedger.create({
      data: {
        user_id: userId,
        kind: 'grant',
        amount: grant,
        balance_after: grant + kept,
        meta: {
          reason: 'plan_change',
          plan,
          from_plan: before.plan,
          previous_balance: before.balance,
        },
      },
    });
    return acc;
  }

  /**
   * A top-up pack was paid for (the payment webhook, or an admin recording a
   * manual sale): the tokens are added to the balance and to the never-expiring
   * bought part. `ref` is the payment's id, kept in the ledger.
   */
  async addTopup(userId: string, pack: string, ref: string) {
    const p = TOPUPS[pack];
    if (!p) throw new Error(`Unknown top-up: ${pack}`);
    await this.account(userId);
    const acc = await this.prisma.creditAccount.update({
      where: { user_id: userId },
      data: {
        balance: { increment: p.tokens },
        topup: { increment: p.tokens },
      },
    });
    await this.prisma.creditLedger.create({
      data: {
        user_id: userId,
        kind: 'topup',
        amount: p.tokens,
        balance_after: acc.balance,
        meta: { pack, ref },
      },
    });
    return acc;
  }

  /** What the seeker sees: balance, refill date and the latest movements. */
  async overview(userId: string, limit: number) {
    const acc = await this.account(userId);
    const rows = await this.prisma.creditLedger.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit || 20, 1), 100),
    });
    return {
      plan: acc.plan,
      balance: shown(acc.balance),
      // bought tokens still in the balance: they are spent last and never expire
      topup: shown(keptTopup(acc)),
      monthly: planOf(acc.plan).monthly,
      periodStart: acc.period_start,
      resetsAt: acc.period_end,
      history: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: shown(r.amount),
        balanceAfter: shown(r.balance_after),
        feature: r.feature,
        label: r.feature
          ? (FEATURE_LABELS[r.feature] ?? r.feature)
          : r.kind === 'grant'
            ? 'Monthly tokens'
            : r.kind === 'topup'
              ? 'Top-up'
              : r.kind === 'adjust'
                ? 'Adjustment by Plato'
                : r.kind,
        at: r.created_at,
      })),
    };
  }

  /**
   * Start paying for a plan or a top-up. No payment provider is connected yet (it
   * needs a merchant account): until PAYMENTS_PROVIDER is set this answers 503
   * payments_unavailable; never an upgrade without a payment. With one, this
   * creates its checkout and returns the URL; its webhook calls setPlan() or addTopup().
   */
  async checkout(userId: string, item: CheckoutItem): Promise<{ url: string }> {
    if ('plan' in item) {
      const acc = await this.account(userId);
      if (acc.plan === item.plan)
        throw new BadRequestException(
          `You are already on ${PLANS[item.plan].label}.`,
        );
    } else if (!TOPUPS[item.pack])
      throw new BadRequestException('Unknown top-up.');
    if (!process.env.PAYMENTS_PROVIDER)
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'payments_unavailable',
        message:
          'Online payment is not open yet. Contact support to upgrade your plan or buy tokens.',
      });
    // ponytail: provider checkout goes here (Paymob / Fawry / Stripe), then its webhook -> setPlan() or addTopup()
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'payments_unavailable',
      message: `The ${process.env.PAYMENTS_PROVIDER} checkout is not connected yet.`,
    });
  }

  /** Admin: a seeker by user id or email. */
  async resolveUser(ref: string) {
    const user = await this.prisma.user.findFirst({
      where: ref.includes('@')
        ? { email: { equals: ref, mode: 'insensitive' } }
        : /^[a-f0-9]{24}$/i.test(ref)
          ? { id: ref }
          : { id: '000000000000000000000000' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('No such user');
    return user.id;
  }

  /** Admin: one seeker's account and latest movements. */
  async adminView(userId: string) {
    const [account, ledger] = await Promise.all([
      this.account(userId),
      this.prisma.creditLedger.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),
    ]);
    return { account, ledger };
  }
}
