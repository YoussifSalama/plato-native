import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { IEnvParams } from '../../types/config/env.types';

export const ADMIN_SESSION_COOKIE = 'plato_admin';
export const ADMIN_PENDING_COOKIE = 'plato_admin_pending';
export const ADMIN_SESSION_AUD = 'plato-admin';
export const ADMIN_PENDING_AUD = 'plato-admin-pending';
export const ADMIN_SESSION_MS = 12 * 3_600_000;
export const ADMIN_PENDING_MS = 10 * 60_000;

export type PendingStep = 'totp' | 'totp_setup';

// t = issue time in ms: compared with sessions_valid_after at full precision
// (JWT iat is whole seconds, too coarse for "everything before now").
export interface AdminSessionClaims {
  sub: string;
  t: number;
}
export interface AdminPendingClaims extends AdminSessionClaims {
  step: PendingStep;
  jti: string;
}

// Admin tokens are HS256 JWTs signed with their own keys, derived from
// JWT_SECRET, and carry their own audience: a seeker token never verifies here,
// and an admin token never verifies in the seeker guard (wrong signature).
// node:crypto, not @nestjs/jwt: one fixed algorithm, nothing negotiable.
const derive = (secret: string, purpose: string) =>
  createHmac('sha256', secret).update(purpose).digest();

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const HEADER = b64({ alg: 'HS256', typ: 'JWT' });

export function signHs256(key: Buffer | string, claims: object) {
  const body = `${HEADER}.${b64(claims)}`;
  const sig = createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** The claims of a well-signed, unexpired HS256 token for `aud`, else null. */
export function verifyHs256(
  key: Buffer | string,
  token: unknown,
  aud: string,
  nowMs = Date.now(),
): Record<string, unknown> | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  const want = createHmac('sha256', key)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!p || typeof p !== 'object' || p.aud !== aud) return null;
    if (typeof p.exp !== 'number' || p.exp * 1000 <= nowMs) return null;
    return p as Record<string, unknown>;
  } catch {
    return null;
  }
}

@Injectable()
export class AdminTokens {
  private readonly sessionKey: Buffer;
  private readonly pendingKey: Buffer;

  constructor(config: ConfigService) {
    const secret = config.get<IEnvParams>('env')?.jwtSecret ?? '';
    this.sessionKey = derive(secret, 'plato-admin-session/v1');
    this.pendingKey = derive(secret, 'plato-admin-pending/v1');
  }

  private claims(sub: string, aud: string, ttlMs: number) {
    const t = Date.now();
    return {
      sub,
      aud,
      t,
      iat: Math.floor(t / 1000),
      exp: Math.floor((t + ttlMs) / 1000),
    };
  }

  signSession(adminId: string) {
    return Promise.resolve(
      signHs256(
        this.sessionKey,
        this.claims(adminId, ADMIN_SESSION_AUD, ADMIN_SESSION_MS),
      ),
    );
  }

  signPending(adminId: string, step: PendingStep) {
    return Promise.resolve(
      signHs256(this.pendingKey, {
        ...this.claims(adminId, ADMIN_PENDING_AUD, ADMIN_PENDING_MS),
        step,
        jti: randomUUID(),
      }),
    );
  }

  /** null for anything that is not a live admin session token. */
  verifySession(token: unknown): Promise<AdminSessionClaims | null> {
    const p = verifyHs256(this.sessionKey, token, ADMIN_SESSION_AUD);
    // A pending token carries a step: never a session, even if keys were shared.
    if (
      !p ||
      typeof p.sub !== 'string' ||
      typeof p.t !== 'number' ||
      'step' in p
    )
      return Promise.resolve(null);
    return Promise.resolve({ sub: p.sub, t: p.t });
  }

  verifyPending(token: unknown): Promise<AdminPendingClaims | null> {
    const p = verifyHs256(this.pendingKey, token, ADMIN_PENDING_AUD);
    if (
      !p ||
      typeof p.sub !== 'string' ||
      typeof p.t !== 'number' ||
      typeof p.jti !== 'string' ||
      (p.step !== 'totp' && p.step !== 'totp_setup')
    )
      return Promise.resolve(null);
    return Promise.resolve({ sub: p.sub, t: p.t, step: p.step, jti: p.jti });
  }
}

// httpOnly, SameSite=Lax, Secure in production (COOKIE_SECURE overrides, as
// for the seeker cookie). Host-only and scoped to /admin: never sent elsewhere.
function cookieOptions(maxAge?: number) {
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/admin',
    ...(maxAge !== undefined && { maxAge }),
  };
}

export function setAdminCookie(
  res: Response,
  name: typeof ADMIN_SESSION_COOKIE | typeof ADMIN_PENDING_COOKIE,
  token: string,
) {
  res.cookie(
    name,
    token,
    cookieOptions(
      name === ADMIN_SESSION_COOKIE ? ADMIN_SESSION_MS : ADMIN_PENDING_MS,
    ),
  );
}

export function clearAdminCookie(
  res: Response,
  name: typeof ADMIN_SESSION_COOKIE | typeof ADMIN_PENDING_COOKIE,
) {
  res.clearCookie(name, cookieOptions());
}
