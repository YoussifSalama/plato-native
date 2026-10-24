// "Is the page ready?", answered by the page itself instead of a guessed delay: the document is
// complete, and neither the DOM nor the network has changed for a short quiet window. Fast pages
// answer at once; slow ones when they are done. The cap is a failure guard, not the expected path.
export interface Settled {
  settled: boolean; // false only when the cap was reached while the page kept changing
  waitedMs: number;
}

export function createSettleWatcher(doc: Document) {
  const view = doc.defaultView!;
  let last = view.performance.now(); // the last DOM mutation or network request
  const bump = () => (last = view.performance.now());
  const mo = new view.MutationObserver(bump);
  mo.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  try {
    new view.PerformanceObserver(bump).observe({ type: 'resource', buffered: false });
  } catch {
    /* no resource timing: DOM quiet alone decides */
  }
  doc.addEventListener('readystatechange', bump);

  return {
    /** Resolves when the page has been quiet for `quietMs` after loading (or at `capMs`). */
    wait(quietMs = 400, capMs = 30_000): Promise<Settled> {
      const start = view.performance.now();
      return new Promise((resolve) => {
        const check = () => {
          if (mo.takeRecords().length) bump(); // changes not delivered to the observer yet still count
          const now = view.performance.now();
          const quiet = now - last >= quietMs;
          if (doc.readyState === 'complete' && quiet) return resolve({ settled: true, waitedMs: Math.round(now - start) });
          if (now - start >= capMs) return resolve({ settled: false, waitedMs: Math.round(now - start) });
          // sleep until the quiet window could have passed since the last change (not a fixed poll)
          view.setTimeout(check, Math.max(50, quietMs - (now - last)));
        };
        check();
      });
    },
  };
}
