// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSettleWatcher } from '../src/dom/settle';

describe('page settle signal', () => {
  it('a quiet loaded page answers right away; a page that keeps changing answers once it stops', async () => {
    const w = createSettleWatcher(document);
    await new Promise((r) => setTimeout(r, 150));
    const t0 = performance.now();
    expect(await w.wait(100, 2000)).toMatchObject({ settled: true });
    expect(performance.now() - t0).toBeLessThan(120);

    // the page keeps rendering for ~300 ms, then stops
    document.body.append(document.createElement('div')); // it is rendering right now
    let n = 0;
    const tick = setInterval(() => (n++ < 6 ? document.body.append(document.createElement('div')) : clearInterval(tick)), 50);
    const t1 = performance.now();
    const r = await w.wait(100, 2000);
    expect(r.settled).toBe(true);
    expect(performance.now() - t1).toBeGreaterThanOrEqual(300);
  });

  it('a page that never stops changing reports it at the cap', async () => {
    const w = createSettleWatcher(document);
    const busy = setInterval(() => document.body.append(document.createElement('i')), 20);
    const r = await w.wait(100, 400);
    clearInterval(busy);
    expect(r.settled).toBe(false);
  });
});
