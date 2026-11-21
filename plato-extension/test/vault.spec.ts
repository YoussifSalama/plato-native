import { describe, expect, it } from 'vitest';
import { makePassword, newKey, open, seal } from '../src/core/vault';

describe('vault: AES-GCM with a key that cannot be read out', () => {
  it('makes 16-character passwords with every character set, different each time', () => {
    const a = makePassword();
    expect(a).toHaveLength(16);
    for (const re of [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%*?]/]) expect(a).toMatch(re);
    expect(makePassword()).not.toBe(a);
  });
  it('seals and opens; the key is not extractable; a tampered entry fails instead of giving a wrong password', async () => {
    const key = await newKey();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    const { iv, ct } = await seal(key, 'S3cret!pass');
    expect(await open(key, iv, ct)).toBe('S3cret!pass');
    const bad = new Uint8Array(ct.slice(0));
    bad[0]! ^= 1;
    await expect(open(key, iv, bad.buffer)).rejects.toThrow();
    const again = await seal(key, 'S3cret!pass');
    expect(Buffer.from(again.iv).equals(Buffer.from(iv))).toBe(false); // a fresh IV every time
  });
});
