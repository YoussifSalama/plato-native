import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from '../src/core/api';
import { isPing } from '../src/core/messages';
import { createOutbox } from '../src/core/outbox';
import { createTokenStore, UntrustedStorageError, type StorageAreaLike } from '../src/core/token-store';

const memArea = (opts: { failAccess?: boolean } = {}) => {
  const data: Record<string, unknown> = {};
  const log: string[] = [];
  const area: StorageAreaLike & { data: typeof data; log: string[] } = {
    data,
    log,
    setAccessLevel: async () => {
      log.push('setAccessLevel');
      if (opts.failAccess) throw new Error('nope');
    },
    get: async (k) => (log.push('get'), k in data ? { [k]: data[k] } : {}),
    set: async (i) => (log.push('set'), void Object.assign(data, i)),
    remove: async (k) => (log.push('remove'), void delete data[k]),
  };
  return area;
};

describe('token store', () => {
  it('restricts storage to trusted contexts BEFORE any read or write', async () => {
    const a = memArea();
    const s = createTokenStore(a);
    expect(await s.get()).toBeNull();
    await s.set('plx_x');
    expect(await s.get()).toBe('plx_x');
    expect(a.log[0]).toBe('setAccessLevel');
    expect(a.log.filter((l) => l === 'setAccessLevel')).toHaveLength(1);
    await s.clear();
    expect(await s.get()).toBeNull();
  });

  it('fails closed: if it cannot restrict storage, the token is never read or written', async () => {
    const a = memArea({ failAccess: true });
    const s = createTokenStore(a);
    await expect(s.get()).rejects.toBeInstanceOf(UntrustedStorageError);
    await expect(s.set('plx_x')).rejects.toBeInstanceOf(UntrustedStorageError);
    expect(a.log).not.toContain('get');
    expect(a.log).not.toContain('set');
    expect(a.data).toEqual({});
  });

  it('never logs the token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
    const s = createTokenStore(memArea());
    await s.set('plx_SECRET');
    await s.get();
    await s.clear();
    for (const sp of spies) expect(JSON.stringify(sp.mock.calls)).not.toContain('SECRET');
    spies.forEach((sp) => sp.mockRestore());
  });
});

describe('api client', () => {
  const make = (res: Partial<Response> & { json?: () => Promise<unknown> } = {}) => {
    const f = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({}), ...res }) as Response);
    return { f, api: createApi({ base: 'https://api.plato.test', getToken: async () => 'plx_T', fetch: f as unknown as typeof fetch }) };
  };

  it('sends a Bearer token with credentials omitted, to the Plato API origin only', async () => {
    const { f, api } = make();
    await api.batches();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.plato.test/extension/v1/batches');
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
    expect(init.headers.Authorization).toBe('Bearer plx_T');
    expect(init.referrerPolicy).toBe('no-referrer');
  });

  it('exchange carries no Authorization header', async () => {
    const { f, api } = make();
    await api.exchange('ABCD-EFGH', 'Laptop', '0.1.0');
    const init = (f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('refuses anything outside /extension/ (no way to aim the token elsewhere)', async () => {
    const { f } = make();
    const api = createApi({ base: 'https://api.plato.test', getToken: async () => 'plx_T', fetch: f as unknown as typeof fetch });
    // item ids are interpolated into paths: an id cannot change the origin
    await api.claim('../../x').catch(() => undefined);
    expect((f.mock.calls[0] as unknown as [string])[0].startsWith('https://api.plato.test/extension/v1/items/')).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a request that never answers is cut off by the timeout, as a status-0 error', async () => {
    // a fetch that honours the abort signal but never resolves on its own
    const hung = (_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)));
    const api = createApi({ base: 'https://a.test', getToken: async () => 't', fetch: hung as unknown as typeof fetch, timeoutMs: 20 });
    await expect(api.me()).rejects.toMatchObject({ status: 0, message: 'Plato did not answer in time' });
  });

  it('maps failures: network error is status 0; 401 is surfaced', async () => {
    const bad = createApi({ base: 'https://a.test', getToken: async () => 't', fetch: (async () => { throw new TypeError('x'); }) as unknown as typeof fetch });
    await expect(bad.me()).rejects.toMatchObject({ status: 0 });
    const { api } = make({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ message: 'Invalid or expired token' }) });
    await expect(api.me()).rejects.toMatchObject({ status: 401, message: 'Invalid or expired token' });
    const none = createApi({ base: 'https://a.test', getToken: async () => null });
    await expect(none.me()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('outbox', () => {
  const area = () => {
    const d: Record<string, unknown> = {};
    return { get: async (k: string) => (k in d ? { [k]: d[k] } : {}), set: async (i: Record<string, unknown>) => void Object.assign(d, i) };
  };
  const body = (seq: number) => ({ attempt_id: 'a', seq, to: 'VERIFY' as const, detail: { reason: 'x' } });

  it('keeps order, de-duplicates, and stops at the first offline failure', async () => {
    const ob = createOutbox(area());
    await ob.enqueue({ itemId: 'i', body: body(1) });
    await ob.enqueue({ itemId: 'i', body: body(1) });
    await ob.enqueue({ itemId: 'i', body: body(2) });
    expect(await ob.list()).toHaveLength(2);
    const calls: number[] = [];
    const api = { transition: async (_: string, b: { seq: number }) => { calls.push(b.seq); throw new ApiError(0, 'offline'); } };
    const r = await ob.flush(api as never);
    expect(r).toMatchObject({ sent: 0, stopped: 'offline' });
    expect(calls).toEqual([1]); // did not skip ahead
    expect(await ob.list()).toHaveLength(2);
  });

  it('sends in order when back online; a 409 is a conflict to reconcile, not a retry', async () => {
    const ob = createOutbox(area());
    for (const s of [1, 2, 3]) await ob.enqueue({ itemId: 'i', body: body(s) });
    const seen: number[] = [];
    const api = { transition: async (_: string, b: { seq: number }) => { seen.push(b.seq); if (b.seq === 2) throw new ApiError(409, 'Out of order'); return {}; } };
    const r = await ob.flush(api as never);
    expect(seen).toEqual([1, 2, 3]);
    expect(r.sent).toBe(2);
    expect(r.conflicts.map((c) => c.body.seq)).toEqual([2]);
    expect(await ob.list()).toEqual([]);
  });

  it('stops on 401 and keeps the entries', async () => {
    const ob = createOutbox(area());
    await ob.enqueue({ itemId: 'i', body: body(1) });
    const r = await ob.flush({ transition: async () => { throw new ApiError(401, 'no'); } } as never);
    expect(r.stopped).toBe('unauthorized');
    expect(await ob.list()).toHaveLength(1);
  });
});

describe('messages', () => {
  it('only a ping is understood', () => {
    expect(isPing({ type: 'plato:ping' })).toBe(true);
    for (const m of [null, 1, 'plato:ping', {}, { type: 'plato:token' }]) expect(isPing(m)).toBe(false);
  });
});
