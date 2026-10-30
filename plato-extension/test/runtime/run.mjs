// Runtime tests: the BUILT fixtures extension in a real Chromium, against local
// servers only. No live site is ever contacted. `npm run test:runtime`.
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServers, TOKEN } from './servers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ext = join(root, 'dist/fixtures');
const { id: EXPECTED_ID } = JSON.parse(readFileSync(join(root, 'extension-key.json'), 'utf8'));
const ORIGIN = `chrome-extension://${EXPECTED_ID}`;

mkdirSync(join(root, '.profile'), { recursive: true });
const profile = mkdtempSync(join(root, '.profile/run-'));
const servers = await startServers({ extensionOrigin: ORIGIN });
const { api, fixture, sink } = servers;

const ctx = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
// every request the browser makes, with the frame that made it
const seen = [];
ctx.on('request', (r) => { let frame = null; try { frame = r.frame()?.url() ?? null; } catch { /* service worker request */ } seen.push({ url: r.url(), frame, sw: frame === null }); });
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;

let failed = 0;
const T = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (e) {
    failed++; console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').join('\n       ')}`);
    // what the panel showed at that moment: the fastest way to see where a flow stopped
    const p = globalThis.__panel;
    if (p && !p.isClosed()) console.log('       panel: ' + (await p.locator('main').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 1500));
    // every job's journal (what the loop did, step by step): where a stuck run is stuck
    const j = await sw.evaluate(async () => Object.entries(await chrome.storage.session.get(null)).filter(([k]) => k.startsWith('journal:') || k.startsWith('trace:'))).catch(() => []);
    for (const [k, lines] of j) console.log(`       ${k}:\n         ${lines.join('\n         ')}`);
    console.log('       api tail: ' + JSON.stringify(api.log.slice(-8).map((l) => `${l.method} ${l.path}`)));
  }
};
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const openPanel = async () => { const p = await ctx.newPage(); await p.goto(`chrome-extension://${id}/panel.html`); return p; };
const btn = (p, name) => p.getByRole('button', { name });
const apiCalls = (path) => api.log.filter((l) => l.path === path && l.method !== 'OPTIONS');
const storageToken = () => sw.evaluate(async () => (await chrome.storage.local.get('plato.token'))['plato.token'] ?? null);
// What the person does: the engine left the free-text answer and the consent box for them.
const personSubmits = async (tab) => { await tab.locator('#submit').click(); }; // everything else was filled by the engine
const itemOnServer = (i) => api.items.find((x) => x.id === i);

console.log(`Runtime tests (fixtures build, extension ${id})`);

await T('the extension id is the pinned one (fixed id from the manifest key)', async () => eq(id, EXPECTED_ID));

await T('loaded manifest has only the approved permissions and no host access', async () => {
  const m = await sw.evaluate(() => chrome.runtime.getManifest());
  eq(m.permissions, ['sidePanel', 'storage', 'tabGroups', 'debugger']);
  ok(!m.host_permissions && !m.externally_connectable, 'unexpected host access');
  eq(m.content_scripts.map((c) => c.matches), [['http://127.0.0.1:4012/*']]);
});

// A Plato-style cookie exists in the browser: the extension must never send it.
await T('setup: browser holds a cookie for the API origin', async () => {
  const p = await ctx.newPage(); await p.goto('http://127.0.0.1:4011/login'); await p.close();
  ok((await ctx.cookies('http://127.0.0.1:4011')).some((c) => c.name === 'plato_session'), 'cookie not set');
});

let panel = await openPanel();
globalThis.__panel = panel;

await T('pairing: wrong code is refused and no token is stored', async () => {
  await panel.locator('#code').fill('WRONG-CODE');
  await btn(panel, 'Link this browser').click();
  await panel.getByText('Invalid or expired code').waitFor();
  eq(await storageToken(), null);
});

await T('pairing: right code stores the token (service worker can read it) and lists the queue', async () => {
  await panel.locator('#code').fill('ABCD-EFGH');
  await btn(panel, 'Link this browser').click();
  await panel.locator('.job').filter({ hasText: 'Engineer 1' }).waitFor({ timeout: 15000 }); // the queue, the newest pick ticked for the first batch
  eq(await storageToken(), TOKEN);
  const ex = apiCalls('/extension/pairing/exchange').at(-1);
  eq([ex.origin, ex.auth, ex.cookie], [ORIGIN, null, null], 'exchange');
});

await T('every API request: extension origin, Bearer token, NO cookie', async () => {
  const calls = api.log.filter((l) => l.path.startsWith('/extension/v1/') && l.method !== 'OPTIONS');
  ok(calls.length > 0, 'no token calls seen');
  for (const c of calls) { eq(c.origin, ORIGIN, c.path); eq(c.auth, `Bearer ${TOKEN}`, c.path); eq(c.cookie, null, `cookie on ${c.path}`); }
});

await T('policy: blocked provider shows no Start and is never claimed or opened', async () => {
  const blocked = panel.locator('.job').filter({ hasText: 'Engineer 9' });
  await blocked.waitFor();
  eq(await blocked.getAttribute('aria-disabled'), 'true', 'a blocked job cannot be picked');
  ok((await blocked.textContent()).includes('not enabled'), 'no reason shown');
  eq(apiCalls('/extension/v1/items/9/claim').length, 0);
  ok(!seen.some((r) => r.url.includes('workable')), 'a workable URL was requested');
});

await T('content script: no storage access, no token, no cookies, no network of its own', async () => {
  const before = sink.log.length;
  const page = await ctx.newPage();
  const mark = seen.length;
  await page.goto('http://127.0.0.1:4012/form.html');
  await page.waitForFunction(() => document.documentElement.dataset.platoStorage && document.documentElement.dataset.platoTokenReply, null, { timeout: 8000 });
  await sleep(800);
  const d = await page.evaluate(() => ({ s: document.documentElement.dataset.platoStorage, t: document.documentElement.dataset.platoTokenReply, p: document.documentElement.dataset.platoProbe, html: document.documentElement.outerHTML }));
  const storage = JSON.parse(d.s);
  for (const area of ['local', 'session', 'sync']) ok(storage[area].startsWith('denied'), `storage.${area} was ${storage[area]}`);
  ok(!d.t.includes('plx_') && !d.html.includes('plx_'), 'token reachable from the page or content script');
  eq(JSON.parse(d.p).calls, [], 'content-world calls (fetch/xhr/beacon/web storage/cookie)');
  eq(sink.log.length, before, 'sink hit');
  const fromPage = seen.slice(mark).filter((r) => r.frame && r.frame.startsWith('http://127.0.0.1:4012'));
  ok(fromPage.every((r) => r.url.startsWith('http://127.0.0.1:4012/')), 'page-frame requests left the fixture origin');
  ok(!api.log.some((l) => l.origin === 'http://127.0.0.1:4012'), 'the API saw a request from the fixture page');
  await page.close();
});

const vectors = `async (sinkHttp, sinkWs) => {
  const out = {};
  const attempt = async (n, f) => { try { out[n] = 'ran:' + String(await f()); } catch (e) { out[n] = 'blocked:' + e.name; } };
  await attempt('fetch', () => fetch(sinkHttp + '/fetch', { mode: 'no-cors' }).then((r) => r.type));
  await attempt('xhr', () => new Promise((res, rej) => { if (typeof XMLHttpRequest === 'undefined') return rej({ name: 'NA' }); const x = new XMLHttpRequest(); x.open('GET', sinkHttp + '/xhr'); x.onload = () => res('ok'); x.onerror = () => rej({ name: 'NetworkError' }); x.send(); }));
  await attempt('beacon', async () => { if (!navigator.sendBeacon) throw { name: 'NA' }; navigator.sendBeacon(sinkHttp + '/beacon', 'x'); await new Promise((r) => setTimeout(r, 300)); return 'queued'; });
  await attempt('websocket', () => new Promise((res, rej) => { const w = new WebSocket(sinkWs); w.onopen = () => res('open'); w.onerror = () => rej({ name: 'WsError' }); setTimeout(() => rej({ name: 'Timeout' }), 1500); }));
  await attempt('eventsource', () => new Promise((res, rej) => { if (typeof EventSource === 'undefined') return rej({ name: 'NA' }); const e = new EventSource(sinkHttp + '/es'); e.onopen = () => res('open'); e.onerror = () => rej({ name: 'EsError' }); setTimeout(() => rej({ name: 'Timeout' }), 1500); }));
  if (typeof document !== 'undefined') {
    const el = (tag, set) => new Promise((res) => { const n = document.createElement(tag); set(n); n.onload = () => res('loaded'); n.onerror = () => res('error'); document.body.append(n); setTimeout(() => res('timeout'), 1200); });
    await attempt('img', () => el('img', (n) => (n.src = sinkHttp + '/img')));
    await attempt('script', () => el('script', (n) => (n.src = sinkHttp + '/script.js')));
    await attempt('stylesheet', () => el('link', (n) => { n.rel = 'stylesheet'; n.href = sinkHttp + '/style.css'; }));
    await attempt('iframe', () => el('iframe', (n) => (n.src = sinkHttp + '/frame')));
    await attempt('prefetch', () => el('link', (n) => { n.rel = 'prefetch'; n.href = sinkHttp + '/prefetch'; }));
    await attempt('form', async () => { const f = document.createElement('form'); f.method = 'post'; f.action = sinkHttp + '/form'; document.body.append(f); f.submit(); await new Promise((r) => setTimeout(r, 400)); return 'submitted'; });
    await attempt('import', () => import(sinkHttp + '/mod.js'));
  } else {
    await attempt('importScripts', () => importScripts(sinkHttp + '/sw.js'));
  }
  out.apiOriginReachable = await fetch('http://127.0.0.1:4011/extension/v1/policy').then((r) => 'status:' + r.status).catch((e) => 'blocked:' + e.name);
  return out;
}`;

await T('CSP: nothing from the side panel page reaches a third party; the API origin still works', async () => {
  const p = await openPanel();
  const out = await p.evaluate(`(${vectors})('http://127.0.0.1:4013', 'ws://127.0.0.1:4013')`);
  eq(sink.log, [], `sink was contacted (${JSON.stringify(out)})`);
  ok(out.apiOriginReachable.startsWith('status:'), 'positive control failed: ' + out.apiOriginReachable);
  await p.close();
});

await T('CSP: nothing from the service worker reaches a third party', async () => {
  const out = await sw.evaluate(`(${vectors})('http://127.0.0.1:4013', 'ws://127.0.0.1:4013')`);
  eq(sink.log, [], `sink was contacted (${JSON.stringify(out)})`);
  ok(out.apiOriginReachable.startsWith('status:'), 'positive control failed: ' + out.apiOriginReachable);
});

await T('the service worker answers no message (nothing can ask it for the token)', async () => {
  const p = await openPanel();
  const r = await p.evaluate(() => chrome.runtime.sendMessage({ type: 'plato:token' }).then((x) => ({ reply: x ?? null }), (e) => ({ error: String(e.message).slice(0, 60) })));
  ok(!JSON.stringify(r).includes('plx_'), 'token in reply');
  await p.close();
});

// The batch runs its jobs in order (the stub's speed setting opens one tab at a time): 1, 2, 3, 4, 5. Each flow below
// settles its job, which frees the slot for the next one; the next tab is awaited BEFORE the click that frees it.
const row = (p, n) => p.locator(`[data-item="${n}"]`);
const ARMED = /Press Submit on the job page yourself|Plato lost the page|Needs you/i;
const nextTab = () => { const p = ctx.waitForEvent('page', { timeout: 60000 }); p.catch(() => undefined); return p; };
const loaded = async (p) => { const t = await p; await t.waitForLoadState('domcontentloaded'); return t; };
let tab;

await T('the batch starts only from the sheet: the five fillable jobs, one tab at a time', async () => {
  eq(await panel.locator('#picked').textContent(), '5 / 10', 'the newest pick is ticked, the blocked job is not');
  await btn(panel, 'Review batch').click();
  await panel.locator('#sheet').waitFor();
  ok(/One batch at a time/.test(await panel.locator('#sheet').textContent()), 'the sheet states the rule');
  const opened = nextTab();
  await panel.locator('#start-batch').click();
  tab = await loaded(opened);
  await panel.locator('#batch-head').waitFor();
});

await T('flow A: arm is recorded BEFORE the person is told to submit; Submit for me presses once; page confirmation is recorded', async () => {
  await row(panel, 1).getByText(ARMED).first().waitFor({ timeout: 90000 });
  // the page was inspected, decided ONCE per page state and filled; the city (revealed by the country) got its own decision
  const val = (sel) => tab.locator(sel).evaluate((e) => (e.type === 'checkbox' ? String(e.checked) : e.value));
  eq([await val('#fn'), await val('#ln'), await val('#em'), await val('#ph'), await val('#co'), await val('#ci'), await val('#msg')], ['Youssif', 'Salama', 'y@example.com', '+201001234567', 'EG', 'Cairo', 'I like what Acme builds.'], 'filled fields (city appears after the country is chosen; the free text is written, not left to the person)');
  eq([await val('#terms'), await val('#pw'), await val('#trap')], ['true', '', ''], 'required consent ticked by the decision; password and honeypot untouched');
  eq(await tab.locator('#cv').evaluate((e) => e.files[0]?.name ?? ''), 'profile-resume.pdf', 'the chosen resume went into the upload field');
  eq(itemOnServer('1').resume_choice, 'profile', 'the choice is kept on the application');
  eq(api.decisions.length, 2, 'decisions so far: the form, then the revealed city');
  const labels = api.decisions[0].fields.map((f) => f.label);
  ok(labels.includes('First name') && !labels.some((l) => /password|website/i.test(l)), `decision fields: ${labels.join(', ')}`);
  eq(api.decisions[1].fields.map((f) => f.label), ['City'], 'the second decision is the revealed field only; nothing filled is sent again');
  const text = await panel.locator('main').innerText();
  ok(!/SECRET/.test(text), 'non-identity candidate data reached the panel view');
  eq(fixture.submits, 0, 'the engine submitted the form');
  eq(itemOnServer('1').state, 'AWAITING_SUBMIT', 'armed by itself once complete');
  eq(api.log.filter((l) => l.path === '/extension/v1/items/1/transition' && l.method === 'POST').length, 4); // PREPARING FILLING REVIEW AWAITING
  // "Submit for me": the seeker's explicit go-ahead for this job; the loop presses Submit and confirms from the page
  const opened = nextTab();
  await row(panel, 1).getByRole('button', { name: 'Submit for me' }).click();
  await tab.waitForURL('**/confirmed.html', { timeout: 30000 });
  eq(fixture.submits, 1);
  await row(panel, 1).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 20000 });
  eq([itemOnServer('1').state, itemOnServer('1').detail?.marker], ['SUBMITTED_CONFIRMED', 'Application received']);
  eq(fixture.submits, 1, 'extra submit');
  await tab.close();
  tab = await loaded(opened);
});

await T('flow B: panel restarts after arming, form still open -> the batch is found again, the job is VERIFY (never resubmitted); the person settles it', async () => {
  const before = fixture.submits;
  await row(panel, 2).getByText(ARMED).first().waitFor({ timeout: 90000 });
  const opened = nextTab(); // job 3 starts when the reloaded panel finds a free slot
  await panel.reload(); // the "crash": all in-memory sessions are gone
  await row(panel, 2).getByText(/cannot tell whether this was sent/).waitFor({ timeout: 15000 });
  eq([itemOnServer('2').state, itemOnServer('2').verify_reason], ['VERIFY', 'form_still_open_after_restart']);
  eq(fixture.submits, before, 'submitted during reconcile');
  await row(panel, 2).getByRole('button', { name: 'It was not' }).click();
  await row(panel, 2).locator('.pill').filter({ hasText: 'Failed' }).waitFor({ timeout: 10000 });
  eq(itemOnServer('2').state, 'FAILED');
  eq(fixture.submits, before);
  await tab.close();
  tab = await loaded(opened);
});

await T('flow C: person submitted, then the panel crashed before recording -> reconcile finds the confirmation and the batch records it', async () => {
  const before = fixture.submits;
  await row(panel, 3).getByText(ARMED).first().waitFor({ timeout: 90000 });
  await personSubmits(tab); // the person completes the rest and submits
  await tab.waitForURL('**/confirmed.html');
  await panel.close(); // crash before anything was recorded
  eq(itemOnServer('3').state, 'AWAITING_SUBMIT');
  panel = await openPanel();
  globalThis.__panel = panel;
  const opened = nextTab(); // job 4 opens once the reopened panel has reconciled (armed after the panel page itself)
  await row(panel, 3).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 15000 }); // reconcile runs before the first draw
  eq([itemOnServer('3').state, itemOnServer('3').detail?.marker], ['SUBMITTED_CONFIRMED', 'Application received']);
  eq(fixture.submits, before + 1, 'exactly the person’s one submit');
  await tab.close();
  tab = await loaded(opened);
});

await T('flow E: listing -> Apply -> 3-step dialog: a page rejects a value (repair), type-ahead, tick list, radio, Next/Review, armed at Submit; Check the page records the confirmation', async () => {
  api.decisions.length = 0; api.repairs.length = 0;
  const before = fixture.submits;
  await row(panel, 4).getByText(ARMED).first().waitFor({ timeout: 90000 });
  const val = (sel) => tab.locator(sel).evaluate((e) => (e.type === 'checkbox' || e.type === 'radio' ? String(e.checked) : e.value));
  eq([await val('#fn'), await val('#em'), await val('#ph')], ['Youssif', 'y@example.com', '201001234567'], 'step 1 filled; the phone the page rejected was corrected by the repair call');
  eq(api.repairs.length, 1, 'exactly one repair call, after the real failure');
  eq(await tab.locator('#menu').getAttribute('data-value'), 'Egypt', 'type-ahead picked from the list');
  eq(await tab.locator('[name=sk]:checked').evaluateAll((els) => els.map((e) => e.value)), ['ts', 'py'], 'tick list: exactly the listed options');
  eq(await val('[name=auth][value=yes]'), 'true', 'radio answered');
  eq(await tab.locator('#s3').isVisible(), true, 'reached the review step');
  const intents = api.decisions.map((d) => d.history.at(-1)?.intent ?? '-');
  ok(api.decisions.length >= 3 && api.decisions.length <= 5, `one decision per page state: ${api.decisions.length} (${intents.join(',')})`);
  eq(itemOnServer('4').state, 'AWAITING_SUBMIT');
  eq(fixture.submits, before, 'the engine submitted');
  await tab.locator('#submit').click();
  await tab.waitForURL('**/confirmed.html');
  eq(fixture.submits, before + 1);
  const opened = nextTab();
  await row(panel, 4).getByRole('button', { name: 'Check the page' }).click();
  await row(panel, 4).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 15000 });
  eq(itemOnServer('4').state, 'SUBMITTED_CONFIRMED');
  await tab.close();
  tab = await loaded(opened);
});

await T('flow F: the page rejects Submit with an inline field error -> the error is read, the field repaired, Submit pressed once more, confirmed', async () => {
  api.decisions.length = 0; api.repairs.length = 0;
  const before = fixture.submits;
  await row(panel, 5).getByText(ARMED).first().waitFor({ timeout: 90000 });
  eq(await tab.locator('#loc').inputValue(), '', 'the stand-in AI has no value for Location on the first decision');
  eq(api.repairs.length, 0, 'no repair before anything failed');
  // the seeker's go-ahead: the loop presses Submit; the page refuses it and shows the error next to the list
  await row(panel, 5).getByRole('button', { name: 'Submit for me' }).click();
  await tab.waitForURL('**/confirmed.html', { timeout: 60000 });
  eq(fixture.submits, before + 1, 'exactly one real submission');
  eq(api.repairs.length, 1, 'one repair call, carrying the page error');
  ok(/This field is required/.test(api.repairs[0].questions[0]?.hint ?? ''), `the repair question carries the page's error: ${api.repairs[0].questions[0]?.hint}`);
  await row(panel, 5).locator('.pill').filter({ hasText: 'Submitted' }).waitFor({ timeout: 20000 });
  eq(itemOnServer('5').state, 'SUBMITTED_CONFIRMED');
  await tab.close();
});

await T('the batch finishes with every outcome on one summary', async () => {
  await panel.locator('#batch-summary').waitFor({ timeout: 20000 });
  const t = await panel.locator('#batch-summary').textContent();
  ok(/Batch finished/.test(t) && /4 of 5 applications sent/.test(t), `summary: ${t.slice(0, 200)}`);
});

await T('flow D: a new batch after a server reset; the tab is closed after arming (page gone) -> VERIFY, not "submitted", not retried', async () => {
  servers.reset();
  await panel.reload();
  await panel.locator('.job').filter({ hasText: 'Engineer 1' }).waitFor({ timeout: 15000 });
  await btn(panel, 'Review batch').click();
  const opened = nextTab();
  await panel.locator('#start-batch').click();
  const t = await loaded(opened);
  await row(panel, 1).getByText(ARMED).first().waitFor({ timeout: 90000 });
  await t.close();
  await panel.reload();
  await row(panel, 1).getByText(/cannot tell whether this was sent/).waitFor({ timeout: 15000 });
  eq([itemOnServer('1').state, itemOnServer('1').verify_reason], ['VERIFY', 'page_closed']);
  eq(fixture.submits, 0);
});

await T('401 from the API: the panel drops the token and asks to pair again', async () => {
  api.force401 = true;
  // the batch is still running in the background (its heartbeats and the periodic refresh may see the 401 first);
  // Refresh in the ⋮ menu is the explicit way to hit the API, skipped if the panel already dropped the link
  const gone = panel.getByText('no longer linked').waitFor({ timeout: 30000 });
  await panel.getByRole('button', { name: 'Menu' }).click({ timeout: 5000 }).then(() => panel.getByRole('menuitem', { name: 'Refresh' }).click({ timeout: 3000 })).catch(() => undefined);
  await gone;
  eq(await storageToken(), null);
  api.force401 = false;
});

await T('unlink: server revokes this device and the token is cleared', async () => {
  await panel.locator('#code').fill('ABCD-EFGH');
  await btn(panel, 'Link this browser').click();
  await panel.locator('#tab-jobs').waitFor({ timeout: 15000 }); // linked again: the panel shows its views
  await panel.getByRole('button', { name: 'Menu' }).click();
  await panel.getByRole('menuitem', { name: 'Unlink this browser' }).click();
  await panel.locator('#code').waitFor();
  eq(apiCalls('/extension/v1/device').at(-1)?.method, 'DELETE');
  eq(await storageToken(), null);
});

await T('over the whole run: no request ever left for a third party or a real job site', async () => {
  const allowed = ['http://127.0.0.1:4011/', 'http://127.0.0.1:4012/', `chrome-extension://${id}/`, 'chrome://', 'data:', 'about:', 'chrome-extension://'];
  const stray = seen.filter((r) => !allowed.some((a) => r.url.startsWith(a)) && !r.url.startsWith('http://127.0.0.1:4013/'));
  eq(stray.map((r) => r.url), []);
  eq(sink.log, []);
  ok(!seen.some((r) => /workable|linkedin|indeed|wuzzuf/i.test(r.url)), 'a provider URL was requested');
});

await ctx.close();
servers.close();
rmSync(profile, { recursive: true, force: true });
console.log(failed ? `\n${failed} runtime test(s) FAILED` : '\nall runtime tests passed');
process.exit(failed ? 1 : 0);
