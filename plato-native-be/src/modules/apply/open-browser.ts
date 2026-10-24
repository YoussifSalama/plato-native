import { Browser, chromium, LaunchOptions } from 'playwright-core';

// ponytail: cloakbrowser is ESM-only and the app is CommonJS, so tsc must not
// rewrite this import() into require().
const esmImport = new Function('m', 'return import(m)') as (
  m: string,
) => Promise<{ launch: (o: { headless?: boolean }) => Promise<Browser> }>;

// BROWSER_CDP_URL (e.g. http://127.0.0.1:9222) = attach to a CloakBrowser
//   container; the container owns headless/headed and close() only disconnects.
// APPLY_USE_CLOAK=true = launch CloakBrowser locally, so a headed run opens
//   a real stealth Chrome window on this machine (binary downloads on first use).
// neither = local Chrome as before.
// plain = always local Playwright Chrome, ignoring both of the above (used for
//   sites that flag the stealth browser, e.g. Ashby).
export async function openBrowser(
  local: LaunchOptions = {},
  { plain = false }: { plain?: boolean } = {},
): Promise<Browser> {
  if (plain) return chromium.launch(local);
  const cdp = process.env.BROWSER_CDP_URL;
  if (cdp) return chromium.connectOverCDP(cdp);
  if (process.env.APPLY_USE_CLOAK === 'true')
    return (await esmImport('cloakbrowser')).launch({
      headless: local.headless,
    });
  return chromium.launch(local);
}
