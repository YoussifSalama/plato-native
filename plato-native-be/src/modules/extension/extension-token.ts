import { createHash, randomBytes, randomInt } from 'crypto';

// Opaque bearer token: 256 random bits. Only its SHA-256 is stored.
export const TOKEN_RE = /^plx_[A-Za-z0-9_-]{43}$/;
export const newToken = () => `plx_${randomBytes(32).toString('base64url')}`;
export const sha256 = (s: string) =>
  createHash('sha256').update(s).digest('hex');

// 8 chars, no 0/O/1/I; shown as ABCD-EFGH.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newPairingCode = () =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    '',
  );
export const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
export const normalizeCode = (c: string) =>
  c.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const SCOPES = [
  'apply:read',
  'apply:write',
  'answers:draft',
  'resume:read',
] as const;
export type ExtensionScope = (typeof SCOPES)[number];

export const MAX_DEVICES = 5;
export const PAIRING_TTL_MS = 120_000;
export const ABSOLUTE_TTL_MS = 30 * 86_400_000;
export const IDLE_TTL_MS = 14 * 86_400_000;

// Every limiter registers itself by name, so the admin panel can list and clear keys.
export const rateLimiters = new Map<string, RateLimiter>();

// ponytail: in-memory fixed window, per process. Move to a shared store if
// the API runs on more than one instance (the admin view then sees one process too).
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  readonly name: string;

  constructor(name = 'limiter') {
    let n = name;
    for (let i = 2; rateLimiters.has(n); i++) n = `${name}-${i}`;
    this.name = n;
    rateLimiters.set(n, this);
  }

  /** Counts a hit; false once `limit` is exceeded inside the window. */
  hit(key: string, limit: number, windowMs: number, now = Date.now()) {
    if (this.hits.size > 10_000)
      for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) {
      this.hits.set(key, { n: 1, reset: now + windowMs });
      return true;
    }
    cur.n++;
    return cur.n <= limit;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  count(key: string, now = Date.now()) {
    const cur = this.hits.get(key);
    return cur && cur.reset > now ? cur.n : 0;
  }

  /** Live keys: what the admin panel lists. */
  entries(now = Date.now()) {
    return [...this.hits]
      .filter(([, v]) => v.reset > now)
      .map(([key, v]) => ({ key, hits: v.n, resetAt: new Date(v.reset) }));
  }
}

/** The admin panel's own sign-in limits: only the super admin sees or clears them. */
export const isAdminLimiter = (name: string) => name.startsWith('admin-');

/** Every live key of every limiter, optionally only keys containing `q`. */
export function listRateLimits(q?: string, now = Date.now()) {
  const needle = q?.trim().toLowerCase();
  return [...rateLimiters.values()].flatMap((l) =>
    l
      .entries(now)
      .filter((e) => !needle || e.key.toLowerCase().includes(needle))
      .map((e) => ({ limiter: l.name, ...e })),
  );
}

/**
 * Clears every key that names one of `ids` (a user id, seeker id, device id, email
 * or IP) as one of its parts: "login:a@b.c:1.2.3.4" is tied to the email and the IP.
 */
export function clearRateLimitsFor(ids: string[], now = Date.now()) {
  const wanted = ids.filter(Boolean).map((s) => s.toLowerCase());
  let cleared = 0;
  for (const l of rateLimiters.values()) {
    // a seeker's support action never lifts the admin panel's sign-in limits
    if (isAdminLimiter(l.name)) continue;
    for (const { key } of l.entries(now)) {
      const k = key.toLowerCase();
      if (wanted.some((t) => k.endsWith(`:${t}`) || k.includes(`:${t}:`))) {
        l.reset(key);
        cleared++;
      }
    }
  }
  return cleared;
}
