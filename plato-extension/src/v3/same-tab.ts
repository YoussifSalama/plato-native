// While Plato applies in a job's tab, everything the page would open in a NEW tab opens in THIS tab instead:
// an Apply link with target=_blank, a script's window.open, a form posting to a new window. The run then simply
// reads the next page where it already works, through as many pages as the application takes (listing -> company
// job page -> Apply -> form). Runs in the page's own JS world (the content script's world can't replace
// window.open), installed through the debugger Plato already holds on that tab, on every page the tab loads.
// Only while the run holds the tab: detaching the debugger removes it for the next page.

export function sameTab(win: Window & typeof globalThis) {
  const w = win as Window & typeof globalThis & { __platoSameTab?: boolean };
  if (w.__platoSameTab) return;
  w.__platoSameTab = true;
  const go = (url: string | URL) => {
    const href = new URL(String(url), w.location.href).href;
    if (/^https?:/i.test(href)) w.location.assign(href);
  };
  const open = w.open;
  // A stand-in for the new window: pages often open a blank one, then set its location.
  const standIn = () => {
    const loc = { assign: go, replace: go, set href(v: string) { go(v); }, get href() { return w.location.href; } };
    const fake: Record<string, unknown> = { closed: false, opener: null, focus() {}, blur() {}, close() {}, document: { write() {}, close() {} } };
    Object.defineProperty(fake, 'location', { get: () => loc, set: (v: string) => go(v) });
    return fake as unknown as Window;
  };
  w.open = function (url?: string | URL, target?: string, features?: string) {
    if (target === '_self' || target === '_parent' || target === '_top') return open.call(w, url, target, features);
    if (url && String(url) !== 'about:blank') {
      go(url);
      return w;
    }
    return standIn();
  } as typeof w.open;
  // Links and forms that name another window: same window. Capture phase, before the page's own handlers.
  const retarget = (el: Element | null) => {
    if (el && 'target' in el && (el as HTMLAnchorElement).target && !/^_(self|parent|top)$/i.test((el as HTMLAnchorElement).target)) (el as HTMLAnchorElement).target = '_self';
  };
  w.document.addEventListener('click', (e) => retarget((e.target as Element | null)?.closest?.('a[target],area[target]') ?? null), true);
  w.document.addEventListener('submit', (e) => retarget(e.target as Element | null), true);
}

/** The same function as page source, for CDP (Runtime.evaluate / Page.addScriptToEvaluateOnNewDocument). */
export const SAME_TAB_SOURCE = `(${sameTab.toString()})(window);`;
