// Service worker. Deliberately small: no network for jobs, no orchestration (the side panel runs
// that), and nothing that ever hands out the token. It restricts storage, wires the toolbar
// button to the side panel, and takes a pairing code from the Plato web app when the seeker is
// logged in there (core/auto-link.ts): it only ever answers "linked or not".
// local holds the token and outbox; sync is never used, restricted as belt and braces.
import { createAutoLink } from './core/auto-link';
import { createTokenStore } from './core/token-store';

const restrict = () =>
  Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]).catch(() => undefined);

const setup = () => {
  void restrict();
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.sidePanel.setOptions({ path: 'panel.html', enabled: true }); // one global panel, every tab
};
// Uncaught errors here go to the side panel, which reports them (core/error-report.ts): the service worker keeps its
// one network call. No panel open = not reported. Never throws, never loops (a failed hand-over is dropped).
let forwarding = false;
const forward = (code: string, e: unknown) => {
  if (forwarding) return;
  forwarding = true;
  try {
    const message = e instanceof Error ? e.message || e.name : String(e);
    const stack = e instanceof Error ? e.stack?.slice(0, 4000) : undefined;
    void chrome.runtime.sendMessage({ type: 'plato:sw-error', code, message: message.slice(0, 500), stack }).catch(() => undefined);
  } catch {
    /* nothing to do */
  } finally {
    forwarding = false;
  }
};
self.addEventListener('error', (ev) => forward('service_worker', (ev as ErrorEvent).error ?? (ev as ErrorEvent).message));
self.addEventListener('unhandledrejection', (ev) => forward('service_worker_rejection', (ev as PromiseRejectionEvent).reason));

setup();
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

const tokens = createTokenStore(chrome.storage.local as never);
const autoLink = createAutoLink({
  webOrigin: __WEB_ORIGIN__,
  tokens,
  // The one network call of the service worker: the same unauthenticated exchange a typed code uses.
  exchange: async (code, device_label, ext_version) => {
    const res = await fetch(`${__API_ORIGIN__}/extension/pairing/exchange`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, device_label, ext_version }),
    });
    if (!res.ok) throw new Error(`exchange ${res.status}`);
    return (await res.json()) as { token: string };
  },
  version: chrome.runtime.getManifest().version,
  // Tell an open side panel to load the account now.
  onLinked: () => void chrome.runtime.sendMessage({ type: 'plato:linked' }).catch(() => undefined),
  // Kept in session storage: the panel picks it up when it opens (or at once, if it is open already).
  onApplyNow: (jobIds) => chrome.storage.session.set({ applyNow: { jobIds, at: Date.now() } }),
  onOpenSearch: (o) => chrome.storage.session.set({ openSearch: { ...o, at: Date.now() } }),
});
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  // Try to open the panel for the person: Chrome allows it only inside a user gesture, which a web page's message
  // usually does not carry. Called before any await (an await spends the gesture); refused = they open it themselves.
  if (/^plato:(apply-now|open-search)$/.test(String((msg as { type?: unknown } | null)?.type)) && sender.origin === __WEB_ORIGIN__ && sender.tab?.windowId !== undefined)
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => undefined);
  void autoLink(msg, sender.origin).then((r) => reply(r ?? undefined));
  return true; // answered asynchronously
});
