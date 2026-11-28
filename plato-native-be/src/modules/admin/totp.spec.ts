import {
  base32Decode,
  base32Encode,
  hotp,
  otpauthUrl,
  verifyTotp,
} from './totp';

// RFC 6238 appendix B: seeds are ASCII "12345678901234567890" repeated to the
// hash's key length; 8-digit codes.
const SEED = {
  sha1: Buffer.from('12345678901234567890'),
  sha256: Buffer.from('12345678901234567890123456789012'),
  sha512: Buffer.from(
    '1234567890123456789012345678901234567890123456789012345678901234',
  ),
};
const VECTORS: [number, string, string, string][] = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(VECTORS)('T=%s matches the RFC vectors', (t, s1, s256, s512) => {
    const c = Math.floor(t / 30);
    expect(hotp(SEED.sha1, c, 'sha1', 8)).toBe(s1);
    expect(hotp(SEED.sha256, c, 'sha256', 8)).toBe(s256);
    expect(hotp(SEED.sha512, c, 'sha512', 8)).toBe(s512);
  });

  it('RFC 4226 HOTP vectors (6 digits)', () => {
    const codes = ['755224', '287082', '359152', '969429', '338314'];
    codes.forEach((code, i) => expect(hotp(SEED.sha1, i)).toBe(code));
  });

  it('base32 round trip (RFC 4648 vector)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode(base32Encode(SEED.sha1)).equals(SEED.sha1)).toBe(true);
  });

  it('verifyTotp accepts the current step and ±1, nothing further, and only 6 digits', () => {
    const secret = base32Encode(SEED.sha1);
    const now = 1111111111 * 1000;
    const step = Math.floor(1111111111 / 30);
    const code = (s: number) => hotp(SEED.sha1, s);
    expect(verifyTotp(secret, code(step), now)).toBe(step);
    expect(verifyTotp(secret, code(step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, code(step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, code(step - 2), now)).toBeNull();
    expect(verifyTotp(secret, code(step + 2), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    expect(verifyTotp('not base32 !', code(step), now)).toBeNull();
  });

  it('otpauth URL names the issuer and the account', () => {
    expect(otpauthUrl('a@b.co', 'ABC')).toBe(
      'otpauth://totp/Plato%20Admin%3Aa%40b.co?secret=ABC&issuer=Plato%20Admin&algorithm=SHA1&digits=6&period=30',
    );
  });
});

import { corsFor } from '../extension/cors';

describe('CORS for /admin/*', () => {
  it('only ADMIN_URL, with credentials; nothing when unset; other routes unchanged', () => {
    const admin = 'https://admin.plato.test/';
    expect(
      corsFor({ url: '/admin/auth/login' }, 'https://web', undefined, admin),
    ).toMatchObject({
      origin: 'https://admin.plato.test',
      credentials: true,
    });
    expect(
      corsFor({ url: '/admin' }, 'https://web', undefined, admin).origin,
    ).toBe('https://admin.plato.test');
    expect(
      corsFor({ url: '/admin/users' }, 'https://web', undefined, undefined)
        .origin,
    ).toBe(false);
    expect(
      corsFor({ url: '/administrator' }, 'https://web', undefined, admin)
        .origin,
    ).toBe('https://web');
    expect(
      corsFor({ url: '/auth/login' }, 'https://web', undefined, admin).origin,
    ).toBe('https://web');
  });
});
