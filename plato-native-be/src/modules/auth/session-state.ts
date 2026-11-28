import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// A password reset signs out every session issued before it, and an admin's
// block refuses them all. Both are read from the user row and cached briefly, so
// most requests cost no query; the instance that made the change forgets its copy at once.
// ponytail: other API instances notice within SESSION_CACHE_MS.
const SESSION_CACHE_MS = 60_000;
type SessionState = { after: number; blocked: boolean };
const cutoffs = new Map<string, SessionState & { until: number }>();

export function forgetSessions(userId: string) {
  cutoffs.delete(userId);
}

/** What a blocked seeker gets, from login, the web session and the extension. */
export const blockedError = () =>
  new ForbiddenException({
    statusCode: 403,
    code: 'BLOCKED',
    message: 'Your account is blocked. Contact support.',
  });

// null = the user row is gone (account deleted, DB reset): the token is dead.
export async function sessionState(
  userId: string,
): Promise<SessionState | null> {
  const hit = cutoffs.get(userId);
  if (hit && hit.until > Date.now()) return hit;
  const prisma = PrismaService.instance;
  if (!prisma) return { after: 0, blocked: false };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessions_valid_after: true, blocked_at: true },
  });
  if (!user) return null;
  const state = {
    after: user.sessions_valid_after?.getTime() ?? 0,
    blocked: !!user.blocked_at,
  };
  if (cutoffs.size > 50_000) cutoffs.clear();
  cutoffs.set(userId, { ...state, until: Date.now() + SESSION_CACHE_MS });
  return state;
}

// A seeker's user never changes, so this one is kept for good (bounded).
const seekerUsers = new Map<string, string | null>();
/** The user behind an extension token's seeker id (null = gone). */
export async function userOfSeeker(jobSeekerId: string) {
  if (seekerUsers.has(jobSeekerId)) return seekerUsers.get(jobSeekerId)!;
  const prisma = PrismaService.instance;
  if (!prisma) return null;
  const js = await prisma.jobSeeker.findUnique({
    where: { id: jobSeekerId },
    select: { user_id: true },
  });
  if (seekerUsers.size > 50_000) seekerUsers.clear();
  if (js) seekerUsers.set(jobSeekerId, js.user_id);
  return js?.user_id ?? null;
}
