// Engine v3 runtime tests: the BUILT fixtures extension (engine v3) in a real Chromium against the local stand-in
// servers, whose v3 endpoint is a scripted brain (servers.mjs v3Turn). No live site, no real model. `npm run test:runtime:v3`.
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkItem, startServers } from './servers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ext = join(root, 'dist/fixtures-v3');
const { id: EXPECTED_ID } = JSON.parse(readFileSync(join(root, 'extension-key.json'), 'utf8'));
const ORIGIN = `chrome-extension://${EXPECTED_ID}`;

mkdirSync(join(root, '.profile'), { recursive: true });
const profile = mkdtempSync(join(root, '.profile/v3-'));
const servers = await startServers({ extensionOrigin: ORIGIN });
const { api, fixture, sink } = servers;
// The v3 suite's own queue (kept at 6 or fewer so the Waiting group stays open): flow A, the rogue brain, the
// human check (6) and the ASK (7), plus the blocked provider.
api.items = [...api.items.filter((i) => ['1', '2', '9'].includes(i.id)), mkItem('6', 'fixture', 'http://127.0.0.1:4012/captcha.html'), mkItem('7', 'fixture', 'http://127.0.0.1:4012/form.html')];

const ctx = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
const seen = [];
ctx.on('request', (r) => { let frame = null; try { frame = r.frame()?.url() ?? null; } catch { /* service worker request */ } seen.push({ url: r.url(), frame }); });
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;

let failed = 0;
const T = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (e) {
    failed++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`);
    const p = globalThis.__panel;
    if (p && !p.isClosed()) console.log('       panel: ' + (await p.locator('main').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 1500));
    const j = await sw.evaluate(async () => Object.entries(await chrome.storage.session.get(null)).filter(([k]) => k.startsWith('journal:'))).catch(() => []);
    for (const [k, lines] of j) console.log(`       ${k}:\n         ${lines.join('\n         ')}`);
    console.log('       v3 tail: ' + JSON.stringify(api.v3log.slice(-3).map((l) => ({ item: l.item, event: l.body.event, results: (l.body.results ?? []).map((r) => (r.ok ? (r.text ?? 'image').slice(0, 40) : `ERR ${r.error}`)) }))).slice(0, 1200));
  }
};
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const openPanel = async () => { const p = await ctx.newPage(); await p.goto(`chrome-extension://${id}/panel.html`); return p; };
const btn = (p, name) => p.getByRole('button', { name });
const itemOnServer = (i) => api.items.find((x) => x.id === i);
const turnsFor = (i) => api.v3log.filter((l) => l.item === i);
const resultsFor = (i) => turnsFor(i).flatMap((l) => l.body.results ?? []);

console.log(`Runtime tests, engine v3 (fixtures build, extension ${id})`);
await T('the built manifest is the same approved one (engine is a build define, not a permission)', async () => {
  const m = await sw.evaluate(() => chrome.runtime.getManifest());
  eq(m.permissions, ['sidePanel', 'storage', 'tabGroups', 'debugger']);
  ok(!m.host_permissions, 'unexpected host access');
});

let panel = await openPanel();
globalThis.__panel = panel;
await T('pairing stores the token and lists the queue', async () => {
  await panel.locator('#code').fill('ABCD-EFGH');
  await btn(panel, 'Link this browser').click();
  await panel.getByText('You’re linked!').waitFor(); // first run: the welcome, then the waiting jobs
  await btn(panel, /Review \d+ waiting job/).click();
  await panel.locator('section.item').filter({ hasText: 'Engineer 1' }).waitFor({ timeout: 15000 });
});

async function startItem(p, n) {
  const sec = p.locator('section.item').filter({ hasText: `Engineer ${n}` });
  const opened = ctx.waitForEvent('page', { timeout: 8000 });
  opened.catch(() => undefined);
  await sec.getByRole('button', { name: 'Start' }).click();
  const tab = await opened;
  await tab.waitForLoadState('domcontentloaded');
  await sec.getByText(/Press Submit on the job page yourself|Plato lost the page|Still needed|needs you/i).first().waitFor({ timeout: 90000 });
  return tab;
}

await T('flow A (v3): the brain fills every field through the executor; armed BEFORE the person is told; Submit for me presses once; the page confirmation is recorded', async () => {
  const tab = await startItem(panel, 1);
  const val = (sel) => tab.locator(sel).evaluate((e) => (e.type === 'checkbox' ? String(e.checked) : e.value));
  eq([await val('#fn'), await val('#ln'), await val('#em'), await val('#ph'), await val('#co'), await val('#ci'), await val('#msg')], ['Youssif', 'Salama', 'y@example.com', '+201001234567', 'EG', 'Cairo', 'I like what Acme builds.'], 'filled fields (the city appears after the country; the free text is written)');
  eq([await val('#terms'), await val('#pw'), await val('#trap')], ['true', '', ''], 'required consent ticked by a real click; password and honeypot untouched');
  eq(await tab.locator('#cv').evaluate((e) => e.files[0]?.name ?? ''), 'profile-resume.pdf', 'the chosen resume went into the upload field');
  eq(itemOnServer('1').resume_choice, 'profile', 'the choice is kept on the application');
  eq(fixture.submits, 0, 'the engine submitted the form');
  eq(itemOnServer('1').state, 'AWAITING_SUBMIT', 'armed by itself once complete');
  const events = turnsFor('1').map((l) => l.body.event);
  ok(events[0] === 'start' && events.slice(1).every((e) => e === 'results'), `turn events: ${events.join(',')}`);
  ok(resultsFor('1').every((r) => r.ok), `every call succeeded: ${JSON.stringify(resultsFor('1').filter((r) => !r.ok))}`);
  ok(resultsFor('1').every((r) => r.state?.tabs?.length === 1), 'every result carries the browser state');
  eq(api.log.filter((l) => l.path.endsWith('/transition') && l.method === 'POST').length, 4); // PREPARING FILLING REVIEW AWAITING
  // "Submit for me": the seeker's go-ahead; the brain presses Submit once and reads the page's own words
  await panel.locator('section.item').filter({ hasText: 'Engineer 1' }).getByRole('button', { name: 'Submit for me' }).click();
  await tab.waitForURL('**/confirmed.html', { timeout: 30000 });
  eq(fixture.submits, 1);
  await panel.locator('section.item').filter({ hasText: 'Engineer 1' }).waitFor({ state: 'detached', timeout: 20000 });
  eq([itemOnServer('1').state, itemOnServer('1').detail?.marker], ['SUBMITTED_CONFIRMED', 'Application received']);
  const pressed = resultsFor('1').filter((r) => /\(Submit\)/.test(r.text ?? ''));
  eq(pressed.length, 1, 'exactly one Submit press reported to the brain');
  eq(fixture.submits, 1, 'extra submit');
  await tab.close();
});

await T('the Submit gate: a brain that presses Submit before it is allowed is refused, the rest of its turn is not executed, nothing is sent', async () => {
  const before = fixture.submits;
  const tab = await startItem(panel, 2);
  const bad = resultsFor('2').filter((r) => !r.ok);
  ok(bad.some((r) => /Refused: Submit is not allowed/.test(r.error ?? '')), `the press was refused: ${JSON.stringify(bad.map((r) => r.error))}`);
  ok(bad.some((r) => /Not executed: an earlier action/.test(r.error ?? '')), 'the type after the refused press was not executed');
  eq(fixture.submits, before, 'the refused press reached the site');
  eq(await tab.locator('#fn').inputValue(), 'Youssif', 'the run carried on after the refusal and filled the form');
  eq(itemOnServer('2').state, 'AWAITING_SUBMIT', 'armed once complete, Submit left to the person');
  await tab.close();
});

await T('captcha stop and resume: a human check seen by the page stops the run for the seeker; after they solve it, Try again continues the same conversation (event solved) and the form is filled', async () => {
  const before = fixture.submits;
  const sec = panel.locator('section.item').filter({ hasText: 'Engineer 6' });
  const tab = await startItem(panel, 6);
  await sec.getByText(/human check \(captcha\)/).waitFor({ timeout: 10000 });
  eq(turnsFor('6').map((l) => l.body.event), ['start'], 'the run stopped on the turn the check was seen');
  eq(await tab.locator('#check').isVisible(), true, 'the engine did not clear the human check itself');
  eq(await tab.locator('#fn').inputValue(), '', 'nothing filled behind the human check');
  await tab.locator('#human').click(); // the seeker solves it on the page
  await sec.getByRole('button', { name: 'Try again' }).click();
  await sec.getByText(/Press Submit on the job page yourself/i).waitFor({ timeout: 60000 });
  const events = turnsFor('6').map((l) => l.body.event);
  ok(events[0] === 'start' && events[1] === 'solved' && events.length > 2 && events.slice(2).every((e) => e === 'results'), `turn events: ${events.join(',')}`);
  const val = (sel) => tab.locator(sel).inputValue();
  eq([await val('#fn'), await val('#ln'), await val('#em')], ['Youssif', 'Salama', 'y@example.com'], 'filled after the check was solved');
  eq(itemOnServer('6').state, 'AWAITING_SUBMIT', 'armed once complete, Submit left to the person');
  eq(fixture.submits, before, 'nothing was sent');
  await tab.close();
});

await T('seeker-answer resume: the brain asks once, the question lands in the panel chat, the reply reruns the job with event seeker_answer and that answer, and the run reaches SUBMIT_READY', async () => {
  const before = fixture.submits;
  const answer = 'Acme builds the tools I use every day.';
  const sec = panel.locator('section.item').filter({ hasText: 'Engineer 7' });
  const tab = await startItem(panel, 7);
  await panel.locator('.composer').waitFor();
  await panel.getByText(/Why do you want to work at Acme\?/).first().waitFor({ timeout: 10000 });
  eq(turnsFor('7').map((l) => l.body.event), ['start', 'results'], 'the run stopped on the ASK');
  eq(await tab.locator('#msg').inputValue(), '', 'nothing written before the seeker answered');
  await panel.locator('#answer').fill(answer);
  await panel.locator('#answer').press('Enter');
  await sec.getByText(/Press Submit on the job page yourself/i).waitFor({ timeout: 60000 });
  eq(api.orchestrator.some((b) => b.message === answer), true, 'the answer went through the panel chat');
  const turns = turnsFor('7');
  const events = turns.map((l) => l.body.event);
  ok(events[2] === 'seeker_answer' && events.length > 3 && events.slice(3).every((e) => e === 'results'), `turn events: ${events.join(',')}`);
  eq(turns[2].body.text, answer, 'the seeker answer carries the note the seeker wrote');
  eq(await tab.locator('#msg').inputValue(), answer, 'the answer was written into the form');
  eq([await tab.locator('#fn').inputValue(), await tab.locator('#terms').isChecked()], ['Youssif', true], 'the rest of the form filled');
  eq(itemOnServer('7').state, 'AWAITING_SUBMIT', 'armed once complete, Submit left to the person');
  eq(fixture.submits, before, 'nothing was sent');
  await tab.close();
});

await T('over the whole run: no request left for a third party or a real job site', async () => {
  eq(sink.log.length, 0, 'third-party sink was contacted');
  const outside = seen.filter((r) => !/^(http:\/\/127\.0\.0\.1:401[12]|chrome-extension:|chrome:|about:|data:|blob:)/.test(r.url));
  eq(outside, [], 'requests outside the local servers');
});

await ctx.close();
servers.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
