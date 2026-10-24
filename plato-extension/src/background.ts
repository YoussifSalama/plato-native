// Service worker. Deliberately almost empty: no message handlers (so nothing can ask it for the
// token), no network, no orchestration (the side panel runs that). It restricts storage and wires
// the toolbar button to the side panel, which is available on every tab.
// local holds the token and outbox; sync is never used, restricted as belt and braces.
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
