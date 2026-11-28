import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreditLedger, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  categoryOf,
  allPlans,
  FEATURE_LABELS,
  planOf,
  tokensFor,
  topupOf,
  type MeteredRow,
} from './credit-prices';
import { InsufficientTokensException } from './insufficient-tokens.exception';

/** One calendar month on, clamped to the month's last day (Jan 31 -> Feb 28, not Mar 3). */
export const addMonth = (d: Date) => {
  const n = new Date(d);
  const day = n.getUTCDate();
  n.setUTCDate(1);
  n.setUTCMonth(n.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0),
  ).getUTCDate();
  n.setUTCDate(Math.min(day, last));
  return n;
};
// What is left of the bought tokens: they are spent last, so min(topup, balance).
const keptTopup = (acc: { topup?: number | null; balance: number }) =>
  Math.max(0, Math.min(acc.topup ?? 0, acc.balance));
const shown = (n: number) => Math.round(n * 10) / 10;
// A hold from before holds carried meta.until is stale after an hour.
const holdUntil = (h: CreditLedger) =>
  (h.meta as { until?: number } | null)?.until ??
  h.created_at.getTime() + 3_600_000;
// How many raw ledger rows one history page groups.
const PAGE_ROWS = 500;

export type CheckoutItem = { plan: string } | { pack: string };
type Tx = Prisma.TransactionClient;

// Plato tokens: accounts, charges, reservations, top-ups and plan changes.
// Everything that changes a balance goes through here and writes the ledger,
// the balance and its ledger row in one transaction.
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

  // Two transactions writing one account at once: Mongo aborts one (P2034), so it runs again.
  private async tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await this.prisma.$transaction(fn);
      } catch (e) {
        const conflict =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2034';
        if (!conflict || i >= 6) throw e;
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 30 * i));
      }
    }
  }

  private async emailConfirmed(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email_verified_at: true },
    });
    return !!u?.email_verified_at;
  }

  /**
   * The seeker's account, created on first use and reset to the plan's grant when
   * its period has ended (no cron: the next read or charge does it). The free
   * grant waits for a confirmed email. Unused monthly tokens do not roll over;
   * bought ones do. Reservations past their time are given back here.
   */
  async account(userId: string, now = new Date()) {
    let acc = await this.prisma.creditAccount.findUnique({
      where: { user_id: userId },
    });
    if (!acc) {
      const confirmed = await this.emailConfirmed(userId);
      const grant = confirmed ? planOf('free').monthly : 0;
      try {
        acc = await this.prisma.creditAccount.create({
          data: {
            user_id: userId,
            plan: 'free',
            balance: grant,
            period_start: now,
            period_end: addMonth(now),
            ...(!confirmed && { unverified: true }),
          },
        });
        if (grant)
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
    if (acc.unverified && (await this.emailConfirmed(userId))) {
      // confirmed since: the plan's grant now, with a month from today; conditional, so it lands once
      const grant = planOf(acc.plan).monthly;
      await this.tx(async (t) => {
        const won = await t.creditAccount.updateMany({
          where: { user_id: userId, unverified: true },
          data: {
            unverified: false,
            balance: { increment: grant },
            period_start: now,
            period_end: addMonth(now),
          },
        });
        if (!won.count) return;
        const after = await t.creditAccount.findUniqueOrThrow({
          where: { user_id: userId },
        });
        await t.creditLedger.create({
          data: {
            user_id: userId,
            kind: 'grant',
            amount: grant,
            balance_after: after.balance,
            meta: { reason: 'email_confirmed', plan: acc!.plan },
          },
        });
      });
      acc = await this.prisma.creditAccount.findUniqueOrThrow({
        where: { user_id: userId },
      });
    }
    // Reservations whose call or run is long over (the browser left, the server
    // restarted mid-run) are closed: given back, or a voice call that connected is
    // billed for its use (closeHold). What is still open stays taken off.
    const open = await this.prisma.creditLedger.findMany({
      where: { user_id: userId, kind: 'hold', settled_at: null },
    });
    let held = 0;
    let released = false;
    for (const h of open)
      if (holdUntil(h) <= now.getTime())
        released = (await this.closeHold(userId, h, now.getTime())) || released;
      else held += -h.amount;
    if (released)
      acc = await this.prisma.creditAccount.findUniqueOrThrow({
        where: { user_id: userId },
      });
    if (now >= acc.period_end) {
      // a plan set by hand runs until paid_until, then the seeker is back on Free
      const lapsed =
        acc.plan !== 'free' && (!acc.paid_until || acc.paid_until <= now);
      const plan = lapsed ? 'free' : acc.plan;
      const grant = acc.unverified ? 0 : planOf(plan).monthly;
      let start = acc.period_end;
      while (addMonth(start) <= now) start = addMonth(start); // a seeker away for months lands in the current period
      const kept = keptTopup({ topup: acc.topup, balance: acc.balance + held }); // bought tokens never expire
      const balance = grant + kept - held; // open reservations stay taken off
      // conditional on the period we read: of two concurrent resets only one wins, so the grant is never doubled
      const won = await this.prisma.creditAccount.updateMany({
        where: { user_id: userId, period_end: acc.period_end },
        data: {
          plan,
          balance,
          topup: kept,
          period_start: start,
          period_end: addMonth(start),
          ...(lapsed && { paid_until: null }),
        },
      });
      if (won.count === 1)
        await this.prisma.creditLedger.create({
          data: {
            user_id: userId,
            kind: 'grant',
            amount: balance - acc.balance,
            balance_after: balance,
            meta: {
              reason: lapsed ? 'plan_lapsed' : 'monthly_reset',
              plan,
              ...(lapsed && { from_plan: acc.plan }),
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

  /**
   * Charge one metered usage event to its seeker. A reserved call (meta.hold)
   * settles here in the same write: its hold back and its real cost out, never
   * more than it reserved, so the tokens it frees are never spent twice.
   * Never throws: metering must not break the feature it measures.
   */
  async charge(userId: string, row: MeteredRow, usageEventId?: string) {
    const holdId = (row.meta as { hold?: unknown } | null)?.hold;
    const cost = tokensFor(row);
    if (!cost && typeof holdId !== 'string') return;
    try {
      await this.account(userId);
      await this.tx((t) =>
        this.settle(
          t,
          userId,
          typeof holdId === 'string' ? holdId : undefined,
          cost,
          row,
          usageEventId,
        ),
      );
    } catch (e) {
      this.logger.warn(
        `charge not recorded (${row.feature}, user ${userId}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Inside a transaction: settle a hold once (its tokens back) and take `cost` out,
   * never more than the hold took. True when the hold was this call's to settle.
   * `onlyHeld`: nothing is charged unless this call settled the hold (no double bill).
   */
  private async settle(
    t: Tx,
    userId: string,
    holdId: string | undefined,
    cost: number,
    row: MeteredRow,
    usageEventId?: string,
    onlyHeld = false,
  ) {
    let back = 0;
    let hold: CreditLedger | null = null;
    if (holdId) {
      hold = await t.creditLedger.findFirst({
        where: { id: holdId, user_id: userId, kind: 'hold' },
      });
      const won =
        hold &&
        (await t.creditLedger.updateMany({
          where: { id: holdId, settled_at: null },
          data: { settled_at: new Date() },
        }));
      if (hold && won && won.count === 1) back = -hold.amount;
    }
    if (onlyHeld && !back) return false;
    const amount = back ? Math.min(cost, back) : cost;
    if (!back && !amount) return false;
    // an atomic $inc: concurrent charges never lose one another
    const acc = await t.creditAccount.update({
      where: { user_id: userId },
      data: { balance: { increment: back - amount } },
    });
    if (back)
      await t.creditLedger.create({
        data: {
          user_id: userId,
          kind: 'release',
          amount: back,
          balance_after: acc.balance + amount,
          feature: hold!.feature,
          meta: { hold: holdId as string },
        },
      });
    if (amount)
      await t.creditLedger.create({
        data: {
          user_id: userId,
          kind: 'consume',
          amount: -amount,
          balance_after: acc.balance,
          feature: row.feature,
          usage_event_id: usageEventId ?? null,
          // meta.thread / meta.run name the search a charge belongs to (history label and grouping).
          meta: {
            ...(row.meta as object | undefined),
            ...(row.model && { model: row.model }),
          },
        },
      });
    return back > 0;
  }

  /** Refuse a paid action when the balance cannot cover `needed` tokens (default: anything left at all). */
  async require(userId: string, needed = 0) {
    const acc = await this.account(userId);
    if (acc.balance <= 0 || acc.balance < needed)
      throw new InsufficientTokensException(
        acc.balance,
        acc.period_end,
        needed || undefined,
        acc.unverified ? planOf('free').monthly : undefined,
      );
    return acc;
  }

  /**
   * Reserve tokens before a call whose cost is known only after it. Atomic: only
   * when the balance covers `amount`, so two calls at once never take the same
   * tokens. Returns the hold's ledger id, or null when it does not fit. An
   * unsettled hold is given back after `ttlMs`.
   */
  async hold(
    userId: string,
    amount: number,
    feature: string,
    meta: Record<string, string | number>,
    ttlMs: number,
  ): Promise<string | null> {
    await this.account(userId);
    return this.tx(async (t) => {
      const won = await t.creditAccount.updateMany({
        where: { user_id: userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (!won.count) return null;
      const acc = await t.creditAccount.findUniqueOrThrow({
        where: { user_id: userId },
      });
      const row = await t.creditLedger.create({
        // explicit null: on MongoDB a null filter does not match a missing field
        data: {
          user_id: userId,
          kind: 'hold',
          amount: -amount,
          balance_after: acc.balance,
          feature,
          settled_at: null,
          meta: { ...meta, until: Date.now() + ttlMs },
        },
      });
      return row.id;
    });
  }

  /** Give a hold back, once (a second call is a no-op). */
  async release(userId: string, holdId: string) {
    return this.tx(async (t) => {
      const hold = await t.creditLedger.findFirst({
        where: { id: holdId, user_id: userId, kind: 'hold' },
      });
      if (!hold) return false;
      const won = await t.creditLedger.updateMany({
        where: { id: holdId, settled_at: null },
        data: { settled_at: new Date() },
      });
      if (won.count !== 1) return false;
      const acc = await t.creditAccount.update({
        where: { user_id: userId },
        data: { balance: { increment: -hold.amount } },
      });
      await t.creditLedger.create({
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
    });
  }

  /**
   * Close a reservation nobody reported: its time is over (the tab was closed) or
   * a retry replaces it. A voice call that connected (meta.connected_at, set by
   * markAlive) was used: it is billed per started minute from connecting to its
   * last heartbeat (or, with none, the reservation's end), never above what it
   * reserved. Anything that never connected (the key or the server failed, the
   * mic was refused) is given back in full.
   */
  async closeHold(userId: string, h: CreditLedger, now = Date.now()) {
    const m = (h.meta ?? {}) as {
      connected_at?: number;
      alive_at?: number;
      minutes?: number;
      thread?: string;
    };
    if (!m.connected_at || !m.minutes) return this.release(userId, h.id);
    const end = Math.min(m.alive_at ?? Infinity, holdUntil(h), now);
    const minutes = Math.min(
      m.minutes,
      Math.max(1, Math.ceil((end - m.connected_at) / 60_000)),
    );
    const cost = (-h.amount * minutes) / m.minutes;
    return this.tx((t) =>
      this.settle(
        t,
        userId,
        h.id,
        cost,
        {
          feature: h.feature ?? 'career.voice',
          meta: {
            ...(m.thread && { thread: m.thread }),
            hold: h.id,
            minutes,
            unreported: true,
          },
        },
        undefined,
        true,
      ),
    );
  }

  /**
   * A live voice call's heartbeat: the first one marks the reservation connected,
   * each one moves its last-alive time (what an unreported call is billed up to).
   */
  async markAlive(userId: string, holdId: string, now = Date.now()) {
    const h = await this.prisma.creditLedger.findFirst({
      where: { id: holdId, user_id: userId, kind: 'hold', settled_at: null },
    });
    if (!h || holdUntil(h) <= now) return false;
    const m = (h.meta ?? {}) as Prisma.JsonObject;
    const won = await this.prisma.creditLedger.updateMany({
      where: { id: holdId, settled_at: null },
      data: {
        meta: { ...m, connected_at: m.connected_at ?? now, alive_at: now },
      },
    });
    return won.count === 1;
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

  /** Move a balance and write its ledger row in one transaction. */
  private move(
    userId: string,
    data: Prisma.CreditAccountUpdateInput,
    amount: number,
    row: { kind: string; meta: Prisma.InputJsonValue },
  ) {
    return this.tx(async (t) => {
      const acc = await t.creditAccount.update({
        where: { user_id: userId },
        data,
      });
      await t.creditLedger.create({
        data: {
          user_id: userId,
          amount,
          balance_after: acc.balance,
          ...row,
        },
      });
      return acc;
    });
  }

  /** Admin: add (or, negative, take away) tokens with a reason, in the ledger like everything else. `admin` = the acting admin's id. */
  async adjust(userId: string, amount: number, reason: string, admin?: string) {
    await this.account(userId);
    return this.move(userId, { balance: { increment: amount } }, amount, {
      kind: 'adjust',
      meta: { reason, ...(admin && { admin }) },
    });
  }

  /**
   * Admin (and later the payment webhook): move a seeker to a plan. A new period
   * starts now with the new plan's full grant, so an upgrade is usable at once;
   * bought tokens stay on top. A paid plan runs `months` periods (paid_until),
   * then lapses to Free.
   */
  async setPlan(
    userId: string,
    plan: string,
    now = new Date(),
    months = 1,
    admin?: string,
  ) {
    const p = allPlans()[plan];
    if (!p) throw new Error(`Unknown plan: ${plan}`);
    const before = await this.account(userId, now);
    const grant = before.unverified ? 0 : p.monthly;
    const kept = keptTopup(before);
    let paidUntil: Date | null = null;
    if (plan !== 'free')
      for (let i = 0, d = now; i < months; i++) paidUntil = d = addMonth(d);
    return this.move(
      userId,
      {
        plan,
        balance: grant + kept,
        topup: kept,
        period_start: now,
        period_end: addMonth(now),
        paid_until: paidUntil,
      },
      grant + kept - before.balance,
      {
        kind: 'grant',
        meta: {
          reason: 'plan_change',
          plan,
          from_plan: before.plan,
          previous_balance: before.balance,
          ...(paidUntil && { paid_until: paidUntil.toISOString() }),
          ...(admin && { admin }),
        },
      },
    );
  }

  /**
   * A top-up pack was paid for (the payment webhook, or an admin recording a
   * manual sale): the tokens are added to the balance and to the never-expiring
   * bought part. `ref` is the payment's id, kept in the ledger.
   */
  async addTopup(userId: string, pack: string, ref: string, admin?: string) {
    const p = topupOf(pack);
    if (!p) throw new Error(`Unknown top-up: ${pack}`);
    await this.account(userId);
    return this.move(
      userId,
      { balance: { increment: p.tokens }, topup: { increment: p.tokens } },
      p.tokens,
      { kind: 'topup', meta: { pack, ref, ...(admin && { admin }) } },
    );
  }

  private label(r: CreditLedger) {
    const meta = (r.meta ?? {}) as {
      thread?: string;
      reason?: string;
      plan?: string;
    };
    if (r.kind === 'hold')
      return r.feature === 'career.voice'
        ? 'Reserved for a voice call'
        : 'Reserved for a job search';
    if (r.feature)
      return [FEATURE_LABELS[r.feature] ?? r.feature, meta.thread]
        .filter(Boolean)
        .join(' · ');
    if (r.kind === 'grant')
      return meta.reason === 'plan_change'
        ? `Plan changed to ${planOf(meta.plan ?? 'free').label}`
        : meta.reason === 'email_confirmed'
          ? 'Free tokens for confirming your email'
          : meta.reason === 'plan_lapsed'
            ? 'Monthly tokens (back on Free)'
            : 'Monthly tokens';
    if (r.kind === 'topup') return 'Top-up';
    if (r.kind === 'adjust') return 'Adjustment by Plato';
    return r.kind;
  }

  /**
   * What the seeker sees: balance, refill date, this period's spending by kind of
   * work (summed here, over the whole period) and one page of history. History
   * groups a search's many board runs (and a day's charges of one feature in one
   * conversation) into one line, leaves out settled reservations (they net to
   * zero) and lines under 0.05 tokens. `before` pages back: pass `nextBefore`.
   */
  async overview(userId: string, limit: number, before?: Date) {
    const acc = await this.account(userId);
    const take = Math.min(Math.max(limit || 20, 1), 100);
    const [rows, spent] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where: {
          user_id: userId,
          ...(before && { created_at: { lte: before } }),
        },
        orderBy: { created_at: 'desc' },
        take: PAGE_ROWS,
      }),
      this.prisma.creditLedger.groupBy({
        by: ['feature'],
        where: {
          user_id: userId,
          kind: 'consume',
          created_at: { gte: acc.period_start },
        },
        _sum: { amount: true },
      }),
    ]);
    const byCategory: Record<string, number> = {};
    for (const s of spent) {
      const c = categoryOf(s.feature);
      byCategory[c] = (byCategory[c] ?? 0) - (s._sum.amount ?? 0);
    }
    for (const c of Object.keys(byCategory))
      if (Math.abs(byCategory[c]) < 0.05) delete byCategory[c];
      else byCategory[c] = shown(byCategory[c]);

    const groups = new Map<string, CreditLedger[]>();
    for (const r of rows) {
      if (r.kind === 'release' || (r.kind === 'hold' && r.settled_at)) continue;
      const meta = (r.meta ?? {}) as { run?: string; thread?: string };
      const key =
        r.kind === 'consume'
          ? `${r.feature}|${meta.run ?? meta.thread ?? ''}|${r.created_at.toISOString().slice(0, 10)}`
          : r.id;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const all = [...groups.values()];
    // The page ends where the first group left out starts (or at the last row read);
    // a group running past it continues on the next page, so nothing is counted twice.
    const cut =
      all.length > take
        ? all[take][0].created_at
        : rows.length === PAGE_ROWS
          ? rows[rows.length - 1].created_at
          : null;
    const history = all
      .slice(0, take)
      .map((g) => (cut ? g.filter((r) => r.created_at > cut) : g))
      .map((g) => ({ g, amount: g.reduce((s, r) => s + r.amount, 0) }))
      // crumbs under 0.05 tokens would read "-0.0"
      .filter(({ g, amount }) => g.length && Math.abs(amount) >= 0.05)
      .map(({ g, amount }) => {
        return {
          id: g[0].id,
          kind: g[0].kind,
          amount: shown(amount),
          balanceAfter: shown(g[0].balance_after),
          feature: g[0].feature,
          category: g[0].feature ? categoryOf(g[0].feature) : null,
          label: this.label(g[0]),
          count: g.length,
          at: g[0].created_at,
        };
      });

    return {
      plan: acc.plan,
      balance: shown(acc.balance),
      // bought tokens still in the balance: they are spent last and never expire
      topup: shown(keptTopup(acc)),
      monthly: planOf(acc.plan).monthly,
      periodStart: acc.period_start,
      resetsAt: acc.period_end,
      paidUntil: acc.paid_until ?? null,
      // the free grant waits for a confirmed email
      awaitingEmail: !!acc.unverified,
      spent: {
        total: shown(Object.values(byCategory).reduce((a, b) => a + b, 0)),
        byCategory,
      },
      history,
      nextBefore: cut,
    };
  }

  /**
   * Start paying for a plan or a top-up. No payment provider is connected yet (it
   * needs a merchant account): until PAYMENTS_PROVIDER is set this records the
   * request (usage_events feature credits.request, listed in the admin report)
   * and answers 503 payments_unavailable; never an upgrade without a payment.
   * With one, this creates its checkout and returns the URL; its webhook calls
   * setPlan() or addTopup().
   */
  async checkout(userId: string, item: CheckoutItem): Promise<{ url: string }> {
    if ('plan' in item) {
      // a switched-off plan is not on sale (accounts already on it keep it)
      if (item.plan === 'free' || !allPlans()[item.plan]?.active)
        throw new BadRequestException('That plan is not on sale.');
      const acc = await this.account(userId);
      if (acc.plan === item.plan)
        throw new BadRequestException(
          `You are already on ${planOf(item.plan).label}.`,
        );
    } else if (!topupOf(item.pack)?.active)
      throw new BadRequestException('Unknown top-up.');
    if (!process.env.PAYMENTS_PROVIDER) {
      // the admin sets it up by hand (POST admin/credits/:user/plan or /topup)
      await this.prisma.usageEvent.create({
        data: {
          feature: 'credits.request',
          user_id: userId,
          cost_usd: 0,
          meta: item,
        },
      });
      this.logger.log(
        `upgrade request from user ${userId}: ${JSON.stringify(item)}`,
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'payments_unavailable',
        message:
          'Online payment is not open yet. Your request is noted and the Plato team will set it up with you by email.',
      });
    }
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
