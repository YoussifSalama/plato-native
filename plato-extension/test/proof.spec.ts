import { describe, expect, it, vi } from 'vitest';
import { captureProof } from '../src/core/proof';

const deps = (over: Partial<Parameters<typeof captureProof>[0]> = {}) => ({
  capture: vi.fn(async () => ({ data: 'data:image/jpeg;base64,/9j/AAAA', url: 'https://jobs.acme.test/thanks' })),
  upload: vi.fn(async () => ({ ok: true })),
  log: vi.fn(),
  now: () => new Date('2026-11-10T10:00:00.000Z'),
  ...over,
});

describe('captureProof: capture, then upload, swallow errors', () => {
  it('captures the tab and uploads the image without the data: prefix, with the page url and time', async () => {
    const d = deps();
    const { uploaded } = await captureProof(d, 'item1', 5);
    expect(await uploaded).toBe(true);
    expect(d.capture).toHaveBeenCalledWith(5);
    expect(d.upload).toHaveBeenCalledWith('item1', { image: '/9j/AAAA', url: 'https://jobs.acme.test/thanks', capturedAt: '2026-11-10T10:00:00.000Z' });
    expect(d.log).not.toHaveBeenCalled();
  });

  it('no tab: nothing captured, nothing sent', async () => {
    const d = deps();
    expect(await (await captureProof(d, 'item1', undefined)).uploaded).toBe(false);
    expect(d.capture).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('a capture that throws, returns nothing, or hangs is logged, never thrown', async () => {
    for (const capture of [vi.fn(async () => { throw new Error('debugger gone'); }), vi.fn(async () => null), vi.fn(() => new Promise<never>(() => undefined))]) {
      const d = deps({ capture, captureCapMs: 20 });
      const r = await captureProof(d, 'item1', 5);
      expect(await r.uploaded).toBe(false);
      expect(d.upload).not.toHaveBeenCalled();
      expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/^Proof screenshot not taken/));
    }
  });

  it('an upload that fails (413, 409, offline) is logged and resolves false', async () => {
    const d = deps({ upload: vi.fn(async () => { throw new Error('Too late to attach proof'); }) });
    const { uploaded } = await captureProof(d, 'item1', 5);
    expect(await uploaded).toBe(false);
    expect(d.log).toHaveBeenCalledWith('Proof screenshot not saved: Too late to attach proof');
  });

  it('a page url that is not http(s) is left out', async () => {
    const d = deps({ capture: vi.fn(async () => ({ data: 'AAAA', url: 'chrome-error://chromewebdata/' })) });
    await (await captureProof(d, 'item1', 5)).uploaded;
    expect(d.upload).toHaveBeenCalledWith('item1', { image: 'AAAA', capturedAt: '2026-11-10T10:00:00.000Z' });
  });
});
