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

// ponytail: in-memory fixed window, per process. Move to a shared store if
// the API runs on more than one instance.
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();

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

  count(key: string, now = Date.now()) {
    const cur = this.hits.get(key);
    return cur && cur.reset > now ? cur.n : 0;
  }
}
