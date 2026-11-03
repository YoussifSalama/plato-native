// Store screenshots (1280x800): the fixtures build in a real Chromium against the local stand-in servers (no live
// site, no real model), the side panel composed next to the job page the way Chrome shows it.
//   node scripts/build.mjs --flavor=fixtures --engine=v3 --out=dist/fixtures-v3 && node scripts/screens.mjs
// Output: store/screens/0N-*.png
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServers } from '../test/runtime/servers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store/screens');
mkdirSync(out, { recursive: true });
const ext = join(root, 'dist/fixtures-v3');
const { id: EXPECTED_ID } = JSON.parse(readFileSync(join(root, 'extension-key.json'), 'utf8'));
const servers = await startServers({ extensionOrigin: `chrome-extension://${EXPECTED_ID}` });
const { api } = servers;
// realistic names on the synthetic jobs; the asking job (7) goes first so the question form is on screen early
const names = { 7: ['Frontend Engineer', 'Northwind'], 1: ['Full Stack Developer', 'Contoso'], 2: ['Product Engineer', 'Fabrikam'], 8: ['React Developer', 'Litware'], 6: ['Software Engineer', 'Adatum'] };
const mk = (base) => api.items.find((i) => i.id === base);
api.items = [
  { ...mk('1'), id: '7', job_id: 'j7', job: { title: names[7][0], company: names[7][1], url: 'http://127.0.0.1:4012/form.html' } },
  ...['1', '2'].map((id) => ({ ...mk(id), job: { ...mk(id).job, title: names[id][0], company: names[id][1] } })),
  { ...mk('1'), id: '8', job_id: 'j8', job: { title: names[8][0], company: names[8][1], url: 'http://127.0.0.1:4012/form.html' } },
  { ...mk('1'), id: '6', job_id: 'j6', job: { title: names[6][0], company: names[6][1], url: 'http://127.0.0.1:4012/captcha.html' } },
];

mkdirSync(join(root, '.profile'), { recursive: true });
const profile = mkdtempSync(join(root, '.profile/screens-'));
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`], viewport: { width: 860, height: 800 }, deviceScaleFactor: 1 });
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;

const panel = await ctx.newPage();
await panel.setViewportSize({ width: 420, height: 800 });
await panel.goto(`chrome-extension://${id}/panel.html`);
// a clean frame: no toast in the way, scrolled to the top
const shot = async (name) => {
  await panel.locator('.toast').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  await panel.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); });
  await panel.waitForTimeout(250);
  await panel.screenshot({ path: join(out, `panel-${name}.png`) });
};
let jobTab = null;
// the fixture form is bare HTML; dress it as an application page for the picture only (ids and behaviour untouched)
const PAGE_CSS = `
  body { margin: 0; padding: 40px 48px; font: 15px/1.5 "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif; color: #1e1d2b; background: #f6f7fb; }
  h1 { font-size: 28px; margin: 0 0 4px; } h1::after { content: " · Northwind"; color: #8b899e; font-weight: 500; font-size: 18px; }
  form { background: #fff; border: 1px solid #e7e6f0; border-radius: 14px; padding: 28px 32px; max-width: 640px; margin-top: 20px; display: grid; gap: 14px; }
  label { display: block; font-weight: 600; font-size: 13px; color: #55536b; }
  input:not([type=checkbox]):not([type=file]), select, textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 9px 11px; border: 1px solid #d9d8e3; border-radius: 8px; font: inherit; background: #fff; }
  textarea { min-height: 80px; }
  label:has(input[type=checkbox]) { display: flex; align-items: center; gap: 8px; font-weight: 500; color: #1e1d2b; }
  button { justify-self: start; padding: 10px 18px; border: 0; border-radius: 10px; background: #005ba7; color: #fff; font: inherit; font-weight: 700; }
  #cw, div[hidden] { display: none; } #cw:not([hidden]) { display: block; }
`;
const pageShot = async (name) => {
  if (!jobTab || jobTab.isClosed()) return null;
  await jobTab.addStyleTag({ content: PAGE_CSS }).catch(() => undefined);
  await jobTab.waitForTimeout(150);
  return jobTab.screenshot({ path: join(out, `page-${name}.png`) });
};

await panel.locator('#code').fill('ABCD-EFGH');
await panel.getByRole('button', { name: 'Link this browser' }).click();
await panel.locator('.job').first().waitFor({ timeout: 15000 });
await panel.waitForTimeout(400);
await shot('01-jobs');

await panel.getByRole('button', { name: 'Review batch' }).click();
await panel.locator('#sheet').waitFor();
await panel.waitForTimeout(300);
await shot('02-review');

const opened = ctx.waitForEvent('page', { timeout: 60000 });
await panel.locator('#start-batch').click();
jobTab = await opened;
await jobTab.waitForLoadState('domcontentloaded');
await jobTab.setViewportSize({ width: 860, height: 800 });
// the first job asks two questions: the stepper form
await panel.locator('[data-item="7"]').getByText(/relocate/i).waitFor({ timeout: 90000 });
await panel.waitForTimeout(300);
await shot('03-question');
await pageShot('03-question');
await panel.locator('[data-item="7"]').getByRole('button', { name: 'No', exact: true }).click();
await panel.locator('#ask-next-7').click();
await panel.locator('#ask-7-why').fill('Northwind builds the tools I use every day.');
await panel.waitForTimeout(200);
await shot('04-question-2');
await panel.locator('#ask-send-7').click();
await panel.locator('[data-item="7"]').getByText(/Press Submit on the job page yourself/i).waitFor({ timeout: 60000 });
await panel.waitForTimeout(300);
await shot('05-filled');
await pageShot('05-filled');

await ctx.close();
servers.close();
console.log(`panel and page shots in ${out}`);
