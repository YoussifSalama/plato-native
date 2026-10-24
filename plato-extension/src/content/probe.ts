// FIXTURES BUILD ONLY. Runs before content.ts in the same isolated world and
// records what that world tries to do, so runtime tests can prove the real
// content script never touches storage, cookies or the network. Never part of
// the production bundle (asserted in test/bundle.spec.ts).
const calls: string[] = [];
const note = (n: string) => calls.push(n);
const wrap = <T extends object>(o: T, k: keyof T, name: string) => {
  const orig = o[k] as unknown as (...a: unknown[]) => unknown;
  if (typeof orig !== 'function') return;
  (o as Record<keyof T, unknown>)[k] = function (this: unknown, ...a: unknown[]) {
    note(name);
    return orig.apply(this, a);
  };
};
wrap(window, 'fetch', 'fetch');
wrap(XMLHttpRequest.prototype, 'open', 'xhr');
wrap(navigator, 'sendBeacon', 'beacon');
for (const k of ['getItem', 'setItem', 'removeItem', 'clear'] as const) {
  wrap(Storage.prototype, k, `webstorage.${k}`);
}
const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
if (cookie?.get)
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => (note('cookie.get'), cookie.get!.call(document)),
    set: (v: string) => (note('cookie.set'), cookie.set!.call(document, v)),
  });
const report = () => (document.documentElement.dataset.platoProbe = JSON.stringify({ calls }));

// What a hostile content script would try against the extension's storage.
void (async () => {
  const out: Record<string, string> = {};
  for (const area of ['local', 'session', 'sync'] as const) {
    try {
      const v = await (chrome.storage[area] as chrome.storage.StorageArea).get(null);
      out[area] = `readable:${Object.keys(v).length}`;
    } catch (e) {
      out[area] = `denied:${String((e as Error).message).slice(0, 80)}`;
    }
  }
  document.documentElement.dataset.platoStorage = JSON.stringify(out);
  // Nothing in the extension answers token requests.
  try {
    const r = await chrome.runtime.sendMessage({ type: 'plato:token' });
    document.documentElement.dataset.platoTokenReply = JSON.stringify(r ?? null);
  } catch (e) {
    document.documentElement.dataset.platoTokenReply = `error:${String((e as Error).message).slice(0, 60)}`;
  }
  report();
})();

chrome.runtime.onMessage.addListener((msg: unknown, _s, send) => {
  if ((msg as { type?: string })?.type !== 'plato:inspect') return false;
  // Fixture pages only: a confirmation element, or an open form.
  const done = document.querySelector('[data-confirmed]');
  send(done ? { kind: 'confirmed', marker: (done.textContent ?? '').trim().slice(0, 200) } : document.querySelector('form') ? { kind: 'form-present' } : { kind: 'gone' });
  return false;
});
setInterval(report, 500);
