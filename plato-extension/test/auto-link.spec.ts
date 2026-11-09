import { describe, expect, it, vi } from 'vitest';
import { browserName, createAutoLink } from '../src/core/auto-link';

const WEB = 'https://jobs.plato.test';
function setup(token: string | null = null) {
  let stored = token;
  const tokens = { get: vi.fn(async () => stored), set: vi.fn(async (t: string) => void (stored = t)), clear: vi.fn(), ensureTrusted: vi.fn() };
  const api = { exchange: vi.fn(async () => ({ token: 'ext-token', device_id: 'd', scopes: [], expires_at: '' })) };
  const onLinked = vi.fn();
  const handle = createAutoLink({ webOrigin: WEB, tokens: tokens as never, exchange: api.exchange, version: '0.2.0', onLinked });
  return { handle, tokens, api, onLinked };
}

describe('auto-link from the logged-in Plato web app', () => {
  it('answers only the Plato web app, and never with the token', async () => {
    const { handle } = setup('secret');
    expect(await handle({ type: 'plato:status' }, 'https://evil.test')).toBeNull();
    expect(await handle({ type: 'plato:status' }, undefined)).toBeNull();
    const r = await handle({ type: 'plato:status' }, WEB);
    expect(r).toEqual({ installed: true, linked: true });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('a code from the page links this browser with the normal exchange', async () => {
    const { handle, api, tokens, onLinked } = setup();
    expect(await handle({ type: 'plato:pair', code: 'ABCD-EFGH' }, WEB)).toEqual({ installed: true, linked: true });
    expect(api.exchange).toHaveBeenCalledWith('ABCD-EFGH', expect.any(String), '0.2.0');
    expect(tokens.set).toHaveBeenCalledWith('ext-token');
    expect(onLinked).toHaveBeenCalled();
  });

  it('keeps an existing link, refuses junk, and reports a failed exchange without throwing', async () => {
    const linked = setup('old');
    await linked.handle({ type: 'plato:pair', code: 'ABCD-EFGH' }, WEB);
    expect(linked.api.exchange).not.toHaveBeenCalled();

    const junk = setup();
    expect(await junk.handle({ type: 'plato:pair', code: '<script>' }, WEB)).toBeNull();
    expect(await junk.handle({ type: 'plato:token' }, WEB)).toBeNull();

    const bad = setup();
    bad.api.exchange.mockRejectedValueOnce(new Error('expired'));
    expect(await bad.handle({ type: 'plato:pair', code: 'ABCDEFGH' }, WEB)).toMatchObject({ linked: false });
    expect(bad.tokens.set).not.toHaveBeenCalled();
  });

  it('names the browser for the Extension page', () => {
    expect(browserName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('Chrome on macOS');
    expect(browserName('')).toBe('This browser');
  });
});
