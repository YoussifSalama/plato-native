import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// TOTP, RFC 6238 over RFC 4226 HOTP: HMAC-SHA1, 6 digits, 30 s steps, ±1 step.
// node:crypto only, no dependency.
export const TOTP_ISSUER = 'Plato Admin';
const STEP_S = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, base32 (what authenticator apps expect). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(
  key: Buffer,
  counter: number,
  algo: 'sha1' | 'sha256' | 'sha512' = 'sha1',
  digits = DIGITS,
): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algo, key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin =
    ((h[off] & 0x7f) << 24) |
    (h[off + 1] << 16) |
    (h[off + 2] << 8) |
    h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const totpStep = (nowMs = Date.now()) =>
  Math.floor(nowMs / 1000 / STEP_S);

/**
 * The matching time step (current ±1), or null. Every candidate is compared,
 * in constant time, so timing says nothing about which one matched.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return null;
  }
  const now = totpStep(nowMs);
  let hit: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    const ok = timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(code));
    if (ok && hit === null) hit = step;
  }
  return hit;
}

export function otpauthUrl(email: string, secret: string) {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${email}`);
  // %20, not URLSearchParams' "+": some authenticator apps show a "+" literally.
  const q = Object.entries({
    secret,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_S),
  })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `otpauth://totp/${label}?${q}`;
}
