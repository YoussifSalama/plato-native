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
});
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  void autoLink(msg, sender.origin).then((r) => reply(r ?? undefined));
  return true; // answered asynchronously
});
