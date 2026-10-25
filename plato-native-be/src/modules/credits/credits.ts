import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { planOf, tokensFor, type MeteredRow } from './credit-prices';

// Plain functions (like recordUsage) so the metering path can charge without
// threading a service through every call site.
const logger = new Logger('Credits');

const addMonth = (d: Date) => {
  const n = new Date(d);
  n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
};
const db = () => {
  const p = PrismaService.instance;
  if (!p) throw new Error('database not ready');
  return p;
};

/**
 * The seeker's account, created with the plan's grant on first use and reset to
 * the grant when its period has ended (no cron: the next read or charge does it).
 * Unused tokens do not roll over.
 */
export async function creditAccount(userId: string, now = new Date()) {
  let acc = await db().creditAccount.findUnique({ where: { user_id: userId } });
  if (!acc) {
    const grant = planOf('free').monthly;
    try {
      acc = await db().creditAccount.create({
        data: {
          user_id: userId,
          plan: 'free',
          balance: grant,
          period_start: now,
          period_end: addMonth(now),
        },
      });
      await db().creditLedger.create({
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
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      ))
        throw e;
      acc = await db().creditAccount.findUniqueOrThrow({
        where: { user_id: userId },
      });
    }
  }
  if (now >= acc.period_end) {
    const grant = planOf(acc.plan).monthly;
    let start = acc.period_end;
    while (addMonth(start) <= now) start = addMonth(start); // a seeker away for months lands in the current period
    // conditional on the period we read: of two concurrent resets only one wins, so the grant is never doubled
    const won = await db().creditAccount.updateMany({
      where: { user_id: userId, period_end: acc.period_end },
      data: {
        balance: grant,
        period_start: start,
        period_end: addMonth(start),
      },
    });
    if (won.count === 1)
      await db().creditLedger.create({
        data: {
          user_id: userId,
          kind: 'grant',
          amount: grant,
          balance_after: grant,
          meta: {
            reason: 'monthly_reset',
            plan: acc.plan,
            previous_balance: acc.balance,
          },
        },
      });
    acc = await db().creditAccount.findUniqueOrThrow({
      where: { user_id: userId },
    });
  }
  return acc;
}

/** Charge one metered usage event to its seeker. Never throws: metering must not break the feature it measures. */
export async function chargeUsage(
  userId: string,
  row: MeteredRow,
  usageEventId?: string,
) {
  const amount = tokensFor(row);
  if (!amount) return;
  try {
    await creditAccount(userId);
    // an atomic $inc: concurrent charges never lose one another
    const acc = await db().creditAccount.update({
      where: { user_id: userId },
      data: { balance: { decrement: amount } },
    });
    await db().creditLedger.create({
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
    logger.warn(
      `charge not recorded (${row.feature}, user ${userId}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
