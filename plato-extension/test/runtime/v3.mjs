// Engine v3 runtime tests: the BUILT fixtures extension (engine v3) in a real Chromium against the local stand-in
// servers, whose v3 endpoint is a scripted brain (servers.mjs v3Turn). No live site, no real model. `npm run test:runtime:v3`.
// One batch of five jobs runs end to end through the real panel: the stub's speed setting opens one tab at a time, so
// the jobs run in order (1, 2, 6, 7, 8) and each flow below settles its job before the next one starts.
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
// The v3 suite's own queue: flow A (1), the rogue brain (2), the blocked provider (9), the human check (6), the ASK (7),
// the Enter-before-Submit brain (8). All in one server batch, so the panel pre-ticks them for the first batch.
api.items = [...api.items.filter((i) => ['1', '2', '9'].includes(i.id)), mkItem('6', 'fixture', 'http://127.0.0.1:4012/captcha.html'), mkItem('7', 'fixture', 'http://127.0.0.1:4012/form.html'), mkItem('8', 'fixture', 'http://127.0.0.1:4012/form.html')];

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
const row = (p, n) => p.locator(`[data-item="${n}"]`);
const ARMED = /Press Submit on the job page yourself|Plato lost the page|human check|Needs you/i;
const itemOnServer = (i) => api.items.find((x) => x.id === i);
const turnsFor = (i) => api.v3log.filter((l) => l.item === i);
const resultsFor = (i) => turnsFor(i).flatMap((l) => l.body.results ?? []);
// the next job's tab opens by itself when a slot frees: arm the wait BEFORE the click that frees it
const nextTab = () => { const p = ctx.waitForEvent('page', { timeout: 60000 }); p.catch(() => undefined); return p; };
const loaded = async (p) => { const tab = await p; await tab.waitForLoadState('domcontentloaded'); return tab; };

console.log(`Runtime tests, engine v3 (fixtures build, extension ${id})`);
await T('the built manifest is the same approved one (engine is a build define, not a permission)', async () => {
  const m = await sw.evaluate(() => chrome.runtime.getManifest());
  eq(m.permissions, ['sidePanel', 'storage', 'tabGroups', 'debugger']);
  ok(!m.host_permissions, 'unexpected host access');
});

let panel = await openPanel();
globalThis.__panel = panel;
await T('pairing stores the token and shows the queued jobs, the newest pick ticked for the first batch; the blocked provider cannot be picked', async () => {
  await panel.locator('#code').fill('ABCD-EFGH');
  await btn(panel, 'Link this browser').click();
  await panel.locator('.job').filter({ hasText: 'Engineer 1' }).waitFor({ timeout: 15000 });
  eq(await panel.locator('#picked').textContent(), '5 / 10', 'the five fillable jobs are ticked, the blocked one is not');
  const blocked = panel.locator('.job').filter({ hasText: 'Engineer 9' });
  eq(await blocked.getAttribute('aria-disabled'), 'true');
  ok((await blocked.textContent()).includes('not enabled'), 'no reason shown');
  eq(api.log.filter((l) => l.path === '/extension/v1/items/9/claim').length, 0);
});

let tab;
await T('the batch starts only from the sheet; while it runs the Jobs view is locked and says so', async () => {
  await btn(panel, 'Review batch').click();
  await panel.locator('#sheet').waitFor();
  const sheet = await panel.locator('#sheet').textContent();
  ok(/One batch at a time/.test(sheet) && /Another batch can start once this one finishes/.test(sheet), 'the sheet states the rule');
  ok(/Start batch · 5 jobs/.test(sheet), `the sheet counts the jobs: ${sheet.slice(0, 200)}`);
  const opened = nextTab();
  await panel.locator('#start-batch').click();
  tab = await loaded(opened);
  await panel.locator('#batch-head').waitFor();
  eq(await panel.locator('#tab-batch').getAttribute('aria-selected'), 'true', 'the panel switches to the batch');
  await panel.locator('#tab-jobs').click();
  ok(/No second batch until this one finishes/.test(await panel.locator('#dock').textContent()), 'the dock says one batch at a time');
  eq(await panel.locator('.job').filter({ hasText: 'Engineer 9' }).getAttribute('aria-disabled'), 'true');
  await panel.locator('#tab-batch').click();
  eq(api.log.filter((l) => l.path.endsWith('/claim') && l.method === 'POST').length, 1, 'one tab at a time (the stub speed): one claim so far');
});

await T('flow A (v3): the brain fills every field through the executor; armed BEFORE the person is told; Submit for me presses once; the page confirmation is recorded on the batch', async () => {
  await row(panel, 1).getByText(ARMED).first().waitFor({ timeout: 90000 });
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
  eq(api.log.filter((l) => l.path === '/extension/v1/items/1/transition' && l.method === 'POST').length, 4); // PREPARING FILLING REVIEW AWAITING
  // "Submit for me": the seeker's go-ahead; the brain presses Submit once and reads the page's own words
  const opened = nextTab(); // job 2 starts once job 1 is done
  await row(panel, 1).getByRole('button', { name: 'Submit for me' }).click();
  await tab.waitForURL('**/confirmed.html', { timeout: 30000 });
  eq(fixture.submits, 1);
  await row(panel, 1).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 20000 });
  eq([itemOnServer('1').state, itemOnServer('1').detail?.marker], ['SUBMITTED_CONFIRMED', 'Application received']);
  const pressed = resultsFor('1').filter((r) => /\(Submit\)/.test(r.text ?? ''));
  eq(pressed.length, 1, 'exactly one Submit press reported to the brain');
  eq(fixture.submits, 1, 'extra submit');
  ok(/Application received/.test(await row(panel, 1).textContent()), 'the row quotes the page’s confirmation');
  await tab.close();
  tab = await loaded(opened);
});

await T('the Submit gate: a brain that presses Submit before it is allowed is refused, the rest of its turn is not executed, nothing is sent', async () => {
  const before = fixture.submits;
  await row(panel, 2).getByText(ARMED).first().waitFor({ timeout: 90000 });
  const bad = resultsFor('2').filter((r) => !r.ok);
  ok(bad.some((r) => /Refused: Submit is not allowed/.test(r.error ?? '')), `the press was refused: ${JSON.stringify(bad.map((r) => r.error))}`);
  ok(bad.some((r) => /Not executed: an earlier action/.test(r.error ?? '')), 'the type after the refused press was not executed');
  eq(fixture.submits, before, 'the refused press reached the site');
  eq(await tab.locator('#fn').inputValue(), 'Youssif', 'the run carried on after the refusal and filled the form');
  eq(itemOnServer('2').state, 'AWAITING_SUBMIT', 'armed once complete, Submit left to the person');
});

await T('interrupted: the panel reloads with job 2 armed and its form still open -> the batch is found again, job 2 goes to "Please check" (VERIFY, never resent), the next job starts by itself; the person settles job 2', async () => {
  const before = fixture.submits;
  const opened = nextTab(); // job 6 starts when the reloaded panel finds a free slot
  await panel.reload();
  await panel.locator('#batch-head').waitFor({ timeout: 15000 });
  await row(panel, 2).getByText(/cannot tell whether this was sent/).waitFor({ timeout: 15000 });
  eq([itemOnServer('2').state, itemOnServer('2').verify_reason], ['VERIFY', 'form_still_open_after_restart']);
  eq(fixture.submits, before, 'submitted during reconcile');
  ok(/1 of 5 finished/.test(await panel.locator('#batch-head').textContent()), 'the batch record survived the reload');
  await row(panel, 2).getByRole('button', { name: 'It was not' }).click();
  await row(panel, 2).locator('.pill').filter({ hasText: 'Failed' }).waitFor({ timeout: 10000 });
  eq(itemOnServer('2').state, 'FAILED');
  await tab.close();
  tab = await loaded(opened);
});

await T('captcha stop and resume: a human check seen by the page stops the run for the seeker; after they solve it, "I did it, continue" continues the same conversation (event solved) and the form is filled', async () => {
  const before = fixture.submits;
  await row(panel, 6).getByText(/human check \(captcha\)/).waitFor({ timeout: 90000 });
  eq(turnsFor('6').map((l) => l.body.event), ['start'], 'the run stopped on the turn the check was seen');
  eq(await tab.locator('#check').isVisible(), true, 'the engine did not clear the human check itself');
  eq(await tab.locator('#fn').inputValue(), '', 'nothing filled behind the human check');
  await tab.locator('#human').click(); // the seeker solves it on the page
  await panel.locator('#continue-6').click();
  await row(panel, 6).getByText(/Press Submit on the job page yourself/i).waitFor({ timeout: 60000 });
  const events = turnsFor('6').map((l) => l.body.event);
  ok(events[0] === 'start' && events[1] === 'solved' && events.length > 2 && events.slice(2).every((e) => e === 'results'), `turn events: ${events.join(',')}`);
  const val = (sel) => tab.locator(sel).inputValue();
  eq([await val('#fn'), await val('#ln'), await val('#em')], ['Youssif', 'Salama', 'y@example.com'], 'filled after the check was solved');
  eq(itemOnServer('6').state, 'AWAITING_SUBMIT', 'armed once complete, Submit left to the person');
  eq(fixture.submits, before, 'nothing was sent');
  const opened = nextTab();
  await row(panel, 6).getByRole('button', { name: 'I submitted it' }).click(); // the person's word, recorded as such
  await row(panel, 6).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 10000 });
  eq(itemOnServer('6').state, 'SUBMITTED_ATTESTED');
  await tab.close();
  tab = await loaded(opened);
});

await T('seeker-answer resume: the brain asks two structured questions; the row shows a stepper (Yes/No pills, then a sentence); the answers rerun the job with event seeker_answer, the text lines and the structured answers, and the run reaches SUBMIT_READY', async () => {
  const before = fixture.submits;
  const answer = 'Acme builds the tools I use every day.';
  await row(panel, 7).getByText(/Are you willing to relocate to Lima\?/).waitFor({ timeout: 90000 });
  eq(turnsFor('7').map((l) => l.body.event), ['start', 'results'], 'the run stopped on the ASK');
  eq(await tab.locator('#msg').inputValue(), '', 'nothing written before the seeker answered');
  ok(await row(panel, 7).getByText('Question 1 of 2').isVisible(), 'a stepper for two questions');
  eq(await row(panel, 7).locator('input[type=text], textarea').count(), 0, 'a Yes/No question shows pills, not a text box');
  await row(panel, 7).getByRole('button', { name: 'No', exact: true }).click();
  await row(panel, 7).locator('#ask-next-7').click();
  await row(panel, 7).getByText('Question 2 of 2').waitFor();
  await row(panel, 7).locator('#ask-7-why').fill(answer);
  await row(panel, 7).locator('#ask-send-7').click();
  await row(panel, 7).getByText(/Press Submit on the job page yourself/i).waitFor({ timeout: 60000 });
  const turns = turnsFor('7');
  const events = turns.map((l) => l.body.event);
  ok(events[2] === 'seeker_answer' && events.length > 3 && events.slice(3).every((e) => e === 'results'), `turn events: ${events.join(',')}`);
  eq(turns[2].body.answers, [{ id: 'relocate', label: 'Are you willing to relocate to Lima?', value: 'No' }, { id: 'why', label: 'Why do you want to work at Acme?', value: answer }], 'the structured answers travel with the turn');
  eq(turns[2].body.text, `Are you willing to relocate to Lima? → No
Why do you want to work at Acme? → ${answer}`, 'the text the brain reads');
  eq(await tab.locator('#msg').inputValue(), answer, 'the answer was written into the form');
  eq([await tab.locator('#fn').inputValue(), await tab.locator('#terms').isChecked()], ['Youssif', true], 'the rest of the form filled');
  eq(itemOnServer('7').state, 'AWAITING_SUBMIT', 'armed once complete, Submit left to the person');
  eq(fixture.submits, before, 'nothing was sent');
  const opened = nextTab();
  await row(panel, 7).getByRole('button', { name: 'I submitted it' }).click();
  await row(panel, 7).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 10000 });
  await tab.close();
  tab = await loaded(opened);
});

await T('one Submit only: after Submit is allowed, an Enter in a text field (a real form submit in Chrome) is cancelled, the rest of that turn is not run, and the Submit press then sends the application exactly once', async () => {
  const before = fixture.submits;
  await row(panel, 8).getByText(ARMED).first().waitFor({ timeout: 90000 });
  eq(itemOnServer('8').state, 'AWAITING_SUBMIT', 'armed once complete');
  await row(panel, 8).getByRole('button', { name: 'Submit for me' }).click();
  await tab.waitForURL('**/confirmed.html', { timeout: 30000 });
  await row(panel, 8).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 20000 });
  const errors = resultsFor('8').filter((r) => !r.ok).map((r) => r.error);
  ok(errors.some((e) => /Submit only with the Submit control itself/.test(e)), `the Enter was refused: ${JSON.stringify(errors)}`);
  ok(errors.some((e) => /Not executed: an earlier action/.test(e)), 'the Submit click after the refused Enter was not run in that turn');
  eq(fixture.submits, before + 1, 'exactly one application reached the site');
  eq(itemOnServer('8').state, 'SUBMITTED_CONFIRMED');
  await tab.close();
});

await T('the batch finishes with a summary of every outcome, and a new batch may start only then', async () => {
  await panel.locator('#batch-summary').waitFor({ timeout: 20000 });
  const t = await panel.locator('#batch-summary').textContent();
  ok(/Batch finished/.test(t) && /4 of 5 applications sent/.test(t), `summary: ${t.slice(0, 200)}`);
  ok(/Retry 1 failed/.test(t), 'the failed one can be retried');
  eq(await panel.locator('.strip i').count(), 5, 'one cell per job');
  await panel.locator('#new-batch').click();
  await panel.locator('#dock').waitFor();
  eq(await panel.locator('#picked').textContent(), '0 / 10', 'a fresh selection');
  eq(await panel.locator('.job').count(), 1, 'only the blocked job is left in the queue');
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
