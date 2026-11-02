/* eslint-disable */
import { corsFor } from './cors';
import { fakePrisma as fakeDb } from './testing/fake-prisma';
import { ExtensionService } from './extension.service';
import {
  newToken,
  normalizeCode,
  RateLimiter,
  sha256,
  TOKEN_RE,
} from './extension-token';

// Strict in-memory stand-in (testing/fake-prisma.ts): like Prisma on Mongo, a
// MISSING field does not match `x: null`.
function fakePrisma() {
  const f = fakeDb();
  return {
    tables: { pairing: f.extensionPairing.rows, device: f.extensionDevice.rows },
    prisma: f as any,
  };
}

const setup = () => {
  const f = fakePrisma();
  return { ...f, svc: new ExtensionService(f.prisma) };
};
const pair = async (svc: ExtensionService, seeker = 'seekerA') => {
  const { code } = await svc.startPairing(seeker);
  return svc.exchange(code, 'Chrome on laptop', '0.1.0');
};

describe('pairing + token lifecycle', () => {
  it('code stores only a hash; token works; token stores only a hash', async () => {
    const { svc, tables } = setup();
    const { code } = await svc.startPairing('seekerA');
    expect(JSON.stringify(tables.pairing)).not.toContain(normalizeCode(code));
    const r = await svc.exchange(code.toLowerCase(), 'Laptop');
    expect(r.token).toMatch(TOKEN_RE);
    expect(JSON.stringify(tables.device)).not.toContain(r.token);
    expect(tables.device[0].token_hash).toBe(sha256(r.token));
    const p = await svc.authenticate(r.token);
    expect(p).toMatchObject({ jobSeekerId: 'seekerA', scopes: r.scopes });
  });

  it('code is single use', async () => {
    const { svc } = setup();
    const { code } = await svc.startPairing('seekerA');
    await svc.exchange(code, 'one');
    await expect(svc.exchange(code, 'two')).rejects.toThrow(
      'Invalid or expired',
    );
  });

  it('code expires after 120 s; a new start replaces the pending code', async () => {
    const { svc, tables } = setup();
    const a = await svc.startPairing('seekerA');
    tables.pairing[0].expires_at = new Date(Date.now() - 1);
    await expect(svc.exchange(a.code, 'x')).rejects.toThrow(
      'Invalid or expired',
    );
    const b = await svc.startPairing('seekerA');
    const c = await svc.startPairing('seekerA');
    await expect(svc.exchange(b.code, 'x')).rejects.toThrow(
      'Invalid or expired',
    );
    await expect(svc.exchange(c.code, 'x')).resolves.toBeDefined();
  });

  it('max five active devices per seeker; revoking frees a slot', async () => {
    const { svc } = setup();
    const first = await pair(svc);
    for (let i = 0; i < 4; i++) await pair(svc);
    const { code } = await svc.startPairing('seekerA');
    await expect(svc.exchange(code, 'sixth')).rejects.toThrow('Device limit');
    // the refused code was not consumed
    await svc.revoke('seekerA', (await svc.listDevices('seekerA'))[0].id);
    await expect(svc.exchange(code, 'sixth')).resolves.toBeDefined();
    void first;
  });

  it('revoked, idle-expired and absolute-expired tokens are rejected', async () => {
    const { svc, tables } = setup();
    const r = await pair(svc);
    const d = tables.device[0];
    d.idle_expires_at = new Date(Date.now() - 1);
    expect(await svc.authenticate(r.token)).toBeNull();
    d.idle_expires_at = new Date(Date.now() + 1e6);
    d.expires_at = new Date(Date.now() - 1);
    expect(await svc.authenticate(r.token)).toBeNull();
    d.expires_at = new Date(Date.now() + 1e6);
    expect(await svc.authenticate(r.token)).not.toBeNull();
    await svc.revoke('seekerA', d.id);
    expect(await svc.authenticate(r.token)).toBeNull();
  });

  it('use slides the idle window but never past the absolute expiry', async () => {
    const { svc, tables } = setup();
    const r = await pair(svc);
    const d = tables.device[0];
    d.last_used_at = new Date(Date.now() - 120_000);
    d.idle_expires_at = new Date(Date.now() + 1000);
    await svc.authenticate(r.token);
    expect(d.idle_expires_at.getTime()).toBeGreaterThan(
      Date.now() + 13 * 86_400_000,
    );
    d.last_used_at = new Date(Date.now() - 120_000);
    d.expires_at = new Date(Date.now() + 5000);
    await svc.authenticate(r.token);
    expect(d.idle_expires_at.getTime()).toBeLessThanOrEqual(
      d.expires_at.getTime(),
    );
  });

  it('malformed tokens never reach the database', async () => {
    const { svc } = setup();
    for (const t of ['', 'plx_short', 'Bearer x', newToken().slice(1)])
      expect(await svc.authenticate(t)).toBeNull();
  });

  it("one seeker cannot revoke another's device", async () => {
    const { svc } = setup();
    await pair(svc, 'seekerA');
    const id = (await svc.listDevices('seekerA'))[0].id;
    await expect(svc.revoke('seekerB', id)).rejects.toThrow('not found');
    await expect(svc.revoke('seekerA', 'not-an-id')).rejects.toThrow();
    expect(await svc.revokeAll('seekerB')).toEqual({ revoked: 0 });
  });
});

describe('RateLimiter', () => {
  it('blocks past the limit and resets after the window', () => {
    const l = new RateLimiter();
    for (let i = 0; i < 5; i++) expect(l.hit('k', 5, 1000, 0)).toBe(true);
    expect(l.hit('k', 5, 1000, 10)).toBe(false);
    expect(l.hit('other', 5, 1000, 10)).toBe(true);
    expect(l.hit('k', 5, 1000, 1001)).toBe(true);
  });
});

describe('CORS per route', () => {
  const ext = 'chrome-extension://abc';
  it('extension routes: extension origin, no credentials', () => {
    for (const url of ['/extension/v1/me', '/extension/pairing/exchange']) {
      const o = corsFor({ url }, 'https://web', ext);
      expect(o).toMatchObject({ origin: ext, credentials: false });
    }
    expect(
      corsFor({ url: '/extension/v1/me' }, 'https://web', undefined).origin,
    ).toBe(false);
  });
  it('everything else (incl. web device routes): web origin with cookies', () => {
    for (const url of [
      '/extension/pairing/start',
      '/extension/devices',
      '/job-seeker/applications',
    ])
      expect(corsFor({ url }, 'https://web', ext)).toEqual({
        origin: 'https://web',
        credentials: true,
      });
  });
});

describe('corsFor: several extension origins', () => {
  it('EXTENSION_ORIGIN may list the unpacked build id and the Web Store id; extension routes allow both, the web app none', () => {
    const o = corsFor({ url: '/extension/v1/me' }, 'https://web', 'chrome-extension://aaaa, chrome-extension://bbbb');
    expect(o.origin).toEqual(['chrome-extension://aaaa', 'chrome-extension://bbbb']);
    expect(corsFor({ url: '/jobs' }, 'https://web', 'chrome-extension://aaaa, chrome-extension://bbbb').origin).toBe('https://web');
  });
});
