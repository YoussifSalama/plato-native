import type { Evidence } from '../core/types';
import { PAGE_SETTLE, PAGE_STATE } from '../core/messages';
import type { PageState } from '../dom/page-state';
import type { PrepareResult, ProviderAdapter } from './types';

// Generic adapter: a guest-fillable application form on the job page itself (Greenhouse, Lever,
// Ashby, Workable). prepare() only waits for the page and reports what it sees; filling is done by the
// panel's form review (zero-click), submitting by the opt-in auto-submit. Nothing here
// clicks or types. Enabled by the owner on 2026-10-17: plato-native-be/docs/providers/*.md.

async function state(tabId: number): Promise<PageState | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: PAGE_STATE })) as PageState | undefined;
  } catch {
    return undefined; // the content script is not up yet
  }
}

// The tab finished loading: Chrome's own event, not a poll. Resolves at once if it already has.
function tabComplete(tabId: number, capMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpd);
      clearTimeout(cap);
      resolve(v);
    };
    const onUpd = (id: number, info: { status?: string }) => id === tabId && info.status === 'complete' && finish(true);
    chrome.tabs.onUpdated.addListener(onUpd);
    const cap = setTimeout(() => finish(false), capMs);
    void chrome.tabs.get(tabId).then((t) => t.status === 'complete' && finish(true), () => finish(false));
  });
}
// Plato's page script answers once the page is loaded and quiet (dom/settle.ts); undefined = no script in the tab.
const settled = (tabId: number, capMs = 30_000) =>
  (chrome.tabs.sendMessage(tabId, { type: PAGE_SETTLE, capMs }) as Promise<{ settled: boolean } | undefined>).catch(() => undefined);

export const formAdapter: ProviderAdapter = {
  // Ready when the page says so: the tab finished loading (Chrome's event), Plato's script is there,
  // and the page went quiet (no DOM or network activity). A loaded tab without the script (opened
  // before the extension reloaded) is reloaded once. Time limits only catch a page that never loads.
  async prepare({ tabId }): Promise<PrepareResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const loaded = await tabComplete(tabId, 60_000);
      const quiet = loaded ? await settled(tabId) : undefined;
      if (quiet) {
        const st = await state(tabId);
        if (st?.captcha) return { kind: 'needs-user', reason: 'captcha' };
        if (st?.closed) return { kind: 'skip', reason: 'closed', message: 'This posting is no longer accepting applications.' };
        return { kind: 'ready' }; // the form, or an "Apply" step first: the AI reads the page next
      }
      if (!loaded) break; // the page never finished loading
      if (attempt === 0) await chrome.tabs.reload(tabId).catch(() => undefined); // loaded but no Plato script yet
    }
    return { kind: 'needs-user', reason: 'questions', detail: 'Plato could not start on this page. Reload the tab, then press Try again.' };
  },

  async inspectOutcome(tabId): Promise<Evidence> {
    const s = await state(tabId);
    if (!s) return { kind: 'unknown' };
    if (s.confirmed) return { kind: 'confirmed', marker: s.confirmed.slice(0, 200) };
    if (s.formPresent) return { kind: 'form-present' };
    return { kind: 'unknown' }; // the page changed but proves nothing: VERIFY, never a resend
  },
};

/**
 * Indeed / Wuzzuf: the seeker's own logged-in browser. If the apply form is on the page we work on
 * it like any form; otherwise the job stops for the seeker.
 */
export const boardAdapter: ProviderAdapter = {
  async prepare(ctx): Promise<PrepareResult> {
    const r = await formAdapter.prepare(ctx);
    return r.kind === 'unsupported' ? { kind: 'needs-user', reason: 'questions' } : r;
  },
  inspectOutcome: formAdapter.inspectOutcome,
};
