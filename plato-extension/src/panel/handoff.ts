// Applying off the job board: a job's Apply button can hand the application to the company's own site, in a new
// tab or in the same one. Plato follows only what its own run led to: the job's tab, and a tab that tab opened.
// Anywhere else Plato's page reader is never loaded.

/** Asked for once (Start batch); optional in the manifest, so nothing is granted at install. */
export const ANY_SITE = { origins: ['https://*/*', 'http://*/*'] };

export interface ReaderDeps {
  ping(tabId: number): Promise<boolean>; // Plato's page reader answers in that tab
  granted(): Promise<boolean>; // the seeker allowed Plato on other sites
  inject(tabId: number): Promise<void>; // load the page reader into the tab
  wait?(ms: number): Promise<void>; // between pings: a known site's own reader may load a moment after the page
}

export type Reader = 'ready' | 'no-access' | 'failed';

/** Our page reader runs in this tab: already there (a known job site), or loaded now on a site the run reached. */
export async function ensureReader(d: ReaderDeps, tabId: number): Promise<Reader> {
  for (let i = 0; i < 3; i++) {
    if (await d.ping(tabId)) return 'ready';
    if (i < 2) await d.wait?.(500);
  }
  if (!(await d.granted())) return 'no-access';
  try {
    await d.inject(tabId);
  } catch {
    return 'failed'; // a page Chrome keeps scripts out of (the Web Store, chrome:// pages, a PDF)
  }
  return (await d.ping(tabId)) ? 'ready' : 'failed';
}

/** A browser "could not reach the page script" error: the tab is on a page our reader is not in (yet). */
export const noReader = (e: unknown) => /Receiving end does not exist|Could not establish connection/i.test(e instanceof Error ? e.message : String(e));

/** What the model is told when the application moved to another tab. */
export const movedNote = (url: string) => {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep the raw text */
  }
  return `The application continued on ${host} in a new tab; Plato switched to that tab and keeps applying there. Read the page.`;
};

export const NO_ACCESS = (url: string) =>
  `The application continued on another site (${url}), and Plato is not allowed on other sites yet. The seeker can allow it in the Plato panel (Start batch asks once), then press Try again.`;
