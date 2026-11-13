import { describe, expect, it, vi } from 'vitest';
import { ensureReader, movedNote, noReader } from '../src/panel/handoff';

const deps = (o: { ping?: boolean[]; granted?: boolean; inject?: () => Promise<void> } = {}) => {
  const pings = [...(o.ping ?? [false, true])];
  return { ping: vi.fn(async () => pings.shift() ?? false), granted: vi.fn(async () => o.granted ?? true), inject: vi.fn(o.inject ?? (async () => undefined)) };
};

describe('following the application to the company site', () => {
  it('a page our reader already runs on (a known job site) needs nothing', async () => {
    const d = deps({ ping: [true] });
    expect(await ensureReader(d, 1)).toBe('ready');
    expect(d.inject).not.toHaveBeenCalled();
  });
  it('another site: the reader is loaded there when the seeker allowed any site', async () => {
    const d = deps({ ping: [false, false, false, true] }); // three pings (a known site's reader may be late), then load it
    expect(await ensureReader(d, 1)).toBe('ready');
    expect(d.inject).toHaveBeenCalledWith(1);
  });
  it('without the seeker allowing other sites, nothing is loaded', async () => {
    const d = deps({ ping: [false, false, false], granted: false });
    expect(await ensureReader(d, 1)).toBe('no-access');
    expect(d.inject).not.toHaveBeenCalled();
  });
  it('a page Chrome keeps scripts out of fails cleanly', async () => {
    const d = deps({ ping: [false, false, false], inject: async () => Promise.reject(new Error('Cannot access contents of the page')) });
    expect(await ensureReader(d, 1)).toBe('failed');
  });
  it('recognises the "no page script" error and names the new site to the model', () => {
    expect(noReader(new Error('Could not establish connection. Receiving end does not exist.'))).toBe(true);
    expect(noReader(new Error('page read_page did not answer in 15s'))).toBe(false);
    expect(movedNote('https://careers.acme.com/apply/123')).toContain('careers.acme.com');
  });
});

describe('a known site whose own reader loads a moment late is not "no access"', () => {
  it('a later ping answers: ready, nothing injected, no permission asked', async () => {
    const d = { ...deps({ ping: [false, true] }), wait: vi.fn(async () => undefined) };
    expect(await ensureReader(d, 1)).toBe('ready');
    expect(d.granted).not.toHaveBeenCalled();
    expect(d.inject).not.toHaveBeenCalled();
  });
});
