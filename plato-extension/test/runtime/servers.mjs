// Local stand-ins: the Plato API (:4011), the fixture job site (:4012) and a
// "third party" sink (:4013) that must never be contacted by the extension.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pages = join(here, '../fixtures/pages');

const NEXT = JSON.parse(readFileSync(join(here, '../../src/core/extension-contract.json'), 'utf8')).transitions;
// Synthetic seeker. Extra fields exist on purpose: the extension must only use identity details.
const CANDIDATE = { fullName: 'Youssif Salama', firstName: 'Youssif', lastName: 'Salama', email: 'y@example.com', phone: '+201001234567', location: 'Cairo, Egypt', country: 'Egypt', currentCompany: 'Acme', links: { linkedin: 'https://linkedin.com/in/ys' }, skills: ['TypeScript'], summary: 'SECRET-BIO', answerBank: { why: 'SECRET-ANSWER' } };
const TOKEN = 'plx_' + 'A'.repeat(43);
// What the stand-in AI answers for the fixture form's labels (the profile, plus one written answer).
const DECIDE_VALUES = { 'First name': 'Youssif', 'Last name': 'Salama', Email: 'y@example.com', Phone: '+201001234567', Country: 'Egypt', City: 'Cairo', 'Why us?': 'I like what Acme builds.', Skills: 'TypeScript | Python', 'Are you authorised to work here?': 'Yes', 'I agree to the terms': 'yes' };
// What the stand-in AI answers when told its last value did not work (the repair call).
const REPAIR_VALUES = { Phone: '201001234567', Location: 'Lima' };
const mkItem = (id, provider, url) => ({ id, batch_id: 'b1', job_id: 'j' + id, provider, state: 'PENDING', attempt_id: null, seq: 0, lease_expires_at: null, detail: null, verify_reason: null, job: { title: 'Engineer ' + id, company: 'Acme', url } });

// Engine v3 stand-in brain: a scripted "model" over the browser use tool contract. It reads the tree the executor
// returns (`role "label" … [ref_N]` lines), fills what the synthetic seeker knows with form_input / file_upload,
// reads again, and answers SUBMIT_READY once every known field holds a value. After Submit is allowed it presses the
// Submit control once, reads the page text and answers CONFIRMED with the page's words. Item 2 is the rogue script:
// it tries to press Submit BEFORE it is allowed (the executor must refuse; nothing may be sent). Item 7 asks the
// seeker once (ASK) before filling, and writes the answer it gets back (event seeker_answer) into "Why us?".
// "solved" (the seeker cleared a human check) and "seeker_answer" both continue with a fresh read of the page.
const V3_VALUES = { 'First name': 'Youssif', 'Last name': 'Salama', Email: 'y@example.com', Phone: '+201001234567', Country: 'Egypt', City: 'Cairo', 'Why us?': 'I like what Acme builds.', 'I agree to the terms': 'yes' };
function v3Turn(store, item, body) {
  const st = (store[item.id] ??= { turn: 0, phase: 'fill', submitAllowed: false, pressed: false, rogue: item.id === '2', rogueTried: false, asks: item.id === '7', asked: false, answer: null });
  st.turn++;
  const reply = (calls) => ({ version: 1, turn: st.turn, calls: calls.map((c, i) => ({ call_id: `c${st.turn}_${i}`, ...c })), submit_allowed: st.submitAllowed && !st.pressed });
  const outcome = (o) => ({ version: 1, turn: st.turn, outcome: o });
  const READ = { name: 'read_page', input: { filter: 'interactive' } };
  if (body.event === 'start') { st.phase = 'fill'; return reply([READ]); }
  if (body.event === 'submit') { st.submitAllowed = true; return reply([READ]); }
  if (body.event === 'solved') return reply([READ]);
  if (body.event === 'seeker_answer') { st.answer = body.text ?? ''; return reply([READ]); }
  const results = body.results ?? [];
  const text = results.map((r) => r.text ?? '').join('\n');
  if (st.phase === 'pressed') { st.phase = 'reading'; return reply([{ name: 'get_page_text', input: {} }]); }
  if (st.phase === 'reading') return /Application received/.test(text) ? outcome({ kind: 'confirmed', quote: 'Application received' }) : outcome({ kind: 'unconfirmed', text: text.slice(0, 100) });
  const lines = [...text.matchAll(/^(\S+) "([^"]*)"([^\n]*?) \[(ref_\d+)\]$/gm)].map((m) => ({ role: m[1], label: m[2].replace(/\s*\*$/, '').trim(), rest: m[3], ref: m[4] }));
  const has = (l) => /value="/.test(l.rest) || /\bchecked\b/.test(l.rest) || /file="/.test(l.rest);
  const submitBtn = lines.find((l) => l.role === 'button' && /submit application/i.test(l.label));
  if (!lines.length) return st.turn < 30 ? reply([READ]) : outcome({ kind: 'blocked', reason: 'The page gave no tree.' });
  if (st.submitAllowed && submitBtn) { st.phase = 'pressed'; const r = reply([{ name: 'left_click', input: { target: { type: 'ref', ref: submitBtn.ref } } }, { name: 'wait', input: { duration: 1 } }]); st.pressed = true; return r; } // allowed on this turn; pressed from the next (as the backend records it from the result)
  if (st.rogue && submitBtn && !st.rogueTried) { st.rogueTried = true; return reply([{ name: 'left_click', input: { target: { type: 'ref', ref: submitBtn.ref } } }, { name: 'type', input: { text: 'never typed' } }]); }
  if (st.asks && !st.asked) { st.asked = true; return outcome({ kind: 'ask', question: 'Why do you want to work at Acme?' }); }
  const values = st.answer ? { ...V3_VALUES, 'Why us?': st.answer } : V3_VALUES;
  const calls = [];
  for (const l of lines) {
    if (has(l)) continue;
    if (l.role === 'file-input' && /resume/i.test(l.label)) calls.push({ name: 'file_upload', input: { target: { type: 'ref', ref: l.ref }, document_ids: ['resume'] } });
    else if (values[l.label] !== undefined && ['textbox', 'combobox', 'checkbox'].includes(l.role)) calls.push({ name: 'form_input', input: { target: { type: 'ref', ref: l.ref }, value: values[l.label] } });
  }
  if (calls.length) return reply([...calls, READ]);
  if (submitBtn) return outcome({ kind: 'submit_ready', summary: 'Every known field holds a value.' });
  return outcome({ kind: 'blocked', reason: 'No Submit control on this page.' });
}

export function startServers({ extensionOrigin }) {
  const api = { log: [], items: [], revoked: false, force401: false, decisions: [], repairs: [], v3: {}, v3log: [], orchestrator: [] };
  const fixture = { log: [], submits: 0 };
  const sink = { log: [] };
  const reset = () => {
    api.log.length = 0; api.revoked = false; api.force401 = false; api.decisions.length = 0; api.repairs.length = 0; api.v3 = {}; api.v3log.length = 0; api.orchestrator.length = 0;
    api.items = [
      mkItem('1', 'fixture', 'http://127.0.0.1:4012/form.html'),
      mkItem('2', 'fixture', 'http://127.0.0.1:4012/form.html'),
      mkItem('3', 'fixture', 'http://127.0.0.1:4012/form.html'),
      mkItem('4', 'fixture', 'http://127.0.0.1:4012/stepper.html'),
      mkItem('5', 'fixture', 'http://127.0.0.1:4012/rejects.html'),
      mkItem('9', 'workable', 'https://jobs.workable.com/view/never-opened'),
    ];
    fixture.log.length = 0; fixture.submits = 0; sink.log.length = 0;
  };
  reset();

  const apiServer = createServer((req, res) => {
    const origin = req.headers.origin;
    const url = new URL(req.url, 'http://x');
    api.log.push({ method: req.method, path: url.pathname, origin, auth: req.headers.authorization ?? null, cookie: req.headers.cookie ?? null, at: Date.now() });
    // CORS exactly like the real API: the extension origin, no credentials.
    if (origin === extensionOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      return res.writeHead(204).end();
    }
    const json = (code, body) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/login') { // a Plato-style cookie that the extension must never send
      res.setHeader('Set-Cookie', 'plato_session=cookie-value; Path=/; SameSite=Lax');
      return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>logged in</p>');
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === '/extension/pairing/exchange') {
        if (origin !== extensionOrigin) return json(403, { message: 'Origin not allowed' });
        if (body.code !== 'ABCD-EFGH') return json(401, { message: 'Invalid or expired code' });
        return json(201, { token: TOKEN, device_id: 'd1', scopes: ['apply:read', 'apply:write'], expires_at: '2099-01-01' });
      }
      if (!url.pathname.startsWith('/extension/v1/')) return json(404, { message: 'nope' });
      if (origin !== extensionOrigin) return json(403, { message: 'Origin not allowed' });
      if (api.force401 || api.revoked || req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { message: 'Invalid or expired token' });
      if (url.pathname === '/extension/v1/searches') return json(200, []);
      if (url.pathname === '/extension/v1/policy') return json(200, { providers: { workable: 'BLOCKED', fixture: 'FILL_ONLY' }, matches: [] });
      if (url.pathname === '/extension/v1/batches') return json(200, api.items.filter((i) => !['SUBMITTED_CONFIRMED', 'SUBMITTED_ATTESTED', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(i.state)));
      if (url.pathname === '/extension/v1/device' && req.method === 'DELETE') { api.revoked = true; return json(200, { revoked: true }); }
      // the panel's run settings and queue (stubs: auto-submit OFF, so the person presses Submit)
      if (url.pathname === '/extension/v1/settings') return json(200, { autoSubmit: false, coverLetter: true, speed: 'smart', customMessage: '', tabs: 1, resume: null, resumeMode: 'profile' });
      if (url.pathname === '/extension/v1/queue') return json(200, []);
      if (url.pathname === '/extension/v1/consent') return json(200, { ok: true });
      // the panel chat's orchestrator: a stand-in that answers nothing and acts on nothing (the job's own run continues)
      if (url.pathname === '/extension/v1/orchestrator') { api.orchestrator.push(body); return json(200, { reply: '', events: [] }); }
      const m = /^\/extension\/v1\/items\/(\w+)\/(claim|heartbeat|transition|candidate|decide|answers|stops|resume|file|v3\/turn)$/.exec(url.pathname);
      const item = m && api.items.find((i) => i.id === m[1]);
      if (!item) return json(404, { message: 'Item not found' });
      if (m[2] === 'stops') return json(200, { ok: true });
      if (m[2] === 'v3/turn') { api.v3log.push({ item: item.id, body }); return json(200, v3Turn(api.v3, item, body)); }
      // the resume for this application: chosen once, then served as a (tiny) PDF
      if (m[2] === 'resume') { item.resume_choice = body.choice; return json(200, { resume_choice: body.choice }); }
      if (m[2] === 'file') return item.resume_choice ? json(200, { name: `${item.resume_choice}-resume.pdf`, mime: 'application/pdf', data: Buffer.from('%PDF-1.4 fixture').toString('base64') }) : json(409, { message: 'No resume chosen for this application yet' });
      // Stand-in for the AI: one decision per page from the inspected fields and the page's controls.
      // Values by label from the synthetic seeker; the free text is "written" like a cover letter would be.
      if (m[2] === 'decide') {
        api.decisions.push(body);
        const value = (label) => DECIDE_VALUES[label.replace(/\s*\*$/, '').trim()] ?? null;
        const fills = (body.fields ?? []).flatMap((f) => (value(f.label) ? [{ id: f.id, value: value(f.label) }] : []));
        const els = body.snapshot?.elements ?? [];
        const find = (re) => els.find((e) => re.test(e.label));
        const submit = find(/submit application/i), review = find(/^review$/i), nextBtn = find(/^next$/i), apply = find(/^apply now$/i);
        const next = submit
          ? body.autoSubmit ? { action: 'press', ref: submit.ref, intent: 'submit', reason: 'form complete', skip_reason: null } : { action: 'ask', ref: null, intent: 'submit', reason: 'Ready for you to submit.', skip_reason: null }
          : review ? { action: 'press', ref: review.ref, intent: 'review', reason: 'step done', skip_reason: null }
          : nextBtn ? { action: 'press', ref: nextBtn.ref, intent: 'next', reason: 'step done', skip_reason: null }
          : apply ? { action: 'press', ref: apply.ref, intent: 'open_apply', reason: 'start applying', skip_reason: null }
          : { action: 'ask', ref: null, intent: null, reason: 'No submit control on this page.', skip_reason: null };
        return json(200, { page_type: 'application_form', fills, missing: [], next, ask_seeker: null, aiFailed: false });
      }
      if (m[2] === 'answers') { // repair: a corrected value only where the stand-in AI has one
        api.repairs.push(body);
        return json(200, { answers: (body.questions ?? []).map((q) => ({ id: q.id, value: /did not work|rejected/.test(q.hint ?? '') ? (REPAIR_VALUES[q.label.replace(/\s*\*$/, '').trim()] ?? null) : null })), aiFailed: false });
      }
      if (m[2] === 'candidate') {
        if (!['CLAIMED', 'PREPARING', 'NEEDS_USER', 'FILLING', 'REVIEW', 'AWAITING_SUBMIT'].includes(item.state)) return json(409, { message: 'Not the active attempt' });
        return json(200, CANDIDATE);
      }
      if (m[2] === 'claim') {
        if (item.state !== 'PENDING') return json(409, { message: `Item is ${item.state}` });
        Object.assign(item, { state: 'CLAIMED', attempt_id: 'att-' + item.id, seq: 0 });
        return json(201, item);
      }
      if (m[2] === 'heartbeat') return json(201, { ok: true });
      if (body.attempt_id !== item.attempt_id) return json(409, { message: 'Stale attempt' });
      if (body.seq <= item.seq) return body.seq === item.seq && body.to === item.state ? json(201, item) : json(409, { message: 'Out of order' });
      if (body.seq !== item.seq + 1) return json(409, { message: 'Out of order' });
      if (!(NEXT[item.state] ?? []).includes(body.to)) return json(409, { message: `Cannot move ${item.state} -> ${body.to}` });
      Object.assign(item, { state: body.to, seq: body.seq, detail: body.detail ?? null, verify_reason: body.to === 'VERIFY' ? body.detail?.reason ?? null : item.verify_reason });
      return json(201, item);
    });
  });

  const fixtureServer = createServer((req, res) => {
    fixture.log.push({ method: req.method, url: req.url, origin: req.headers.origin ?? null });
    if (req.method === 'POST' && req.url === '/submit') { fixture.submits++; return res.writeHead(303, { Location: '/confirmed.html' }).end(); }
    const file = { '/form.html': 'form.html', '/stepper.html': 'stepper.html', '/rejects.html': 'rejects.html', '/confirmed.html': 'confirmed.html', '/captcha.html': 'captcha.html' }[req.url.split('?')[0]];
    if (!file) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(readFileSync(join(pages, file)));
  });
  const sinkServer = createServer((req, res) => {
    sink.log.push({ method: req.method, url: req.url });
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('sink');
  });
  return new Promise((resolve) => {
    let n = 0;
    const done = () => ++n === 3 && resolve({ api, fixture, sink, reset, close: () => [apiServer, fixtureServer, sinkServer].forEach((s) => s.close()) });
    apiServer.listen(4011, '127.0.0.1', done);
    fixtureServer.listen(4012, '127.0.0.1', done);
    sinkServer.listen(4013, '127.0.0.1', done);
  });
}
export { TOKEN, mkItem };
