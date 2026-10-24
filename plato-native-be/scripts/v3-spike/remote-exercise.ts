#!/usr/bin/env -S npx --no-install tsx
/**
 * Phase 1 end-to-end check without the extension: this script plays the extension against the backend's v3 turn
 * endpoint. Pair (web cookie -> code -> token), batch the job, claim the item, then loop: POST turn -> execute each
 * call with the spike's CDP driver -> POST results, until an outcome. Submit is never pressed (the loop stops at
 * SUBMIT_READY unless --submit is given, which arms the item first).
 *
 *   npx tsx remote-exercise.ts <jobId> [--submit] [--headless 0]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CdpBrowser } from './cdp-browser.js';

const API = 'http://localhost:3000';
const EXT_ORIGIN = 'chrome-extension://nilmidkdmklmoaddnglfalmondjmfeaj';
const SCRATCH = '/tmp/claude-1000/-media-youssif-salama-work1-mine-plato-native/7be43129-e0fc-49ff-a8c9-f1521c15f1be/scratchpad';
const RESUME = `${SCRATCH}/cv/Test_Seeker_CV.pdf`;

const cookie = () => readFileSync(`${SCRATCH}/cookies.txt`, 'utf8').split('\n').map((l) => l.replace(/^#HttpOnly_/, '')).filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).map((f) => `${f[5]}=${f[6]}`).join('; ');
const web = async (path: string, body?: unknown) => { const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { cookie: cookie(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };

async function main() {
  const args = process.argv.slice(2);
  const jobId = args[0]!;
  const submit = args.includes('--submit');
  const headless = !(args.includes('--headless') && args[args.indexOf('--headless') + 1] === '0');
  // one device for this script: reuse its token across runs; revoke earlier script devices so the 5-device cap holds
  const TOKEN_FILE = `${SCRATCH}/v3-remote-token.txt`;
  let token = '';
  try { token = readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { /* first run */ }
  if (token && !(await fetch(`${API}/extension/v1/me`, { headers: { authorization: `Bearer ${token}`, origin: EXT_ORIGIN } })).ok) token = '';
  if (!token) {
    const devices = (await web('/extension/devices')) as { id: string; label: string }[];
    for (const d of devices.filter((d) => d.label === 'v3 remote exercise')) await fetch(`${API}/extension/devices/${d.id}`, { method: 'DELETE', headers: { cookie: cookie() } });
    const { code } = await web('/extension/pairing/start', {});
    const ex = await fetch(`${API}/extension/pairing/exchange`, { method: 'POST', headers: { 'content-type': 'application/json', origin: EXT_ORIGIN }, body: JSON.stringify({ code, device_label: 'v3 remote exercise', ext_version: '0.3.0' }) }).then((r) => r.json());
    if (!ex.token) throw new Error(`exchange failed: ${JSON.stringify(ex)}`);
    token = ex.token as string;
    writeFileSync(TOKEN_FILE, token);
  }
  const ext = async (path: string, body?: unknown, method = 'POST') => { const r = await fetch(API + '/extension/v1' + path, { method, headers: { authorization: `Bearer ${token}`, origin: EXT_ORIGIN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`); return j; };
  let batch = await web('/extension/apply-batches', { jobIds: [jobId] });
  if (!batch.items?.length && batch.rejected?.[0]?.reason === 'duplicate') {
    // a live item from an earlier run holds the job: claim it and cancel it, then batch again
    const live = ((await ext('/batches', undefined, 'GET')) as { id: string; job_id: string; state: string }[]).find((i) => i.job_id === jobId);
    if (live) {
      const c = await ext(`/items/${live.id}/claim`, {}).catch(() => null);
      if (c) await ext(`/items/${live.id}/transition`, { attempt_id: c.attempt_id, seq: (c.seq ?? 0) + 1, to: 'CANCELLED' }).catch(() => null);
      console.log(`cancelled stale item ${live.id} (${live.state})`);
      batch = await web('/extension/apply-batches', { jobIds: [jobId] });
    }
  }
  const item = batch.items?.[0];
  if (!item) throw new Error(`batch rejected: ${JSON.stringify(batch).slice(0, 300)}`);
  const claimed = await ext(`/items/${item.id}/claim`, {});
  let seq = claimed.seq ?? 0;
  const attempt = claimed.attempt_id;
  const transition = async (to: string, detail?: unknown) => { seq++; return ext(`/items/${item.id}/transition`, { attempt_id: attempt, seq, to, detail }); };
  await transition('PREPARING');
  await ext(`/items/${item.id}/resume`, { choice: 'profile' });
  console.log(`item ${item.id} (${item.provider}) claimed`);

  const browser = await CdpBrowser.launch({ headless, configs: { file_upload: { enabled: true } }, confirm: () => true, browserStateHack: undefined } as never);
  const journal: string[] = [];
  const started = Date.now();
  let req: { event: string; results?: unknown[]; text?: string } = { event: 'start' };
  let outcome: Record<string, unknown> | null = null;
  try {
    await transition('FILLING');
    for (let i = 0; i < 60; i++) {
      const res = await ext(`/items/${item.id}/v3/turn`, req);
      if (res.outcome) {
        outcome = res.outcome;
        console.log(`turn ${res.turn}: OUTCOME ${JSON.stringify(res.outcome).slice(0, 300)}`);
        if (res.outcome.kind === 'submit_ready' && submit && req.event !== 'submit') {
          await transition('REVIEW'); await transition('AWAITING_SUBMIT');
          req = { event: 'submit' }; continue; // the gate lifts for one press
        }
        if (res.outcome.kind === 'error') { await new Promise((r) => setTimeout(r, 3000)); continue; } // transient: same event again
        break;
      }
      console.log(`turn ${res.turn}: ${res.calls.map((c: { name: string }) => c.name).join(', ')}`);
      const results: Array<Record<string, unknown>> = [];
      let failed = false;
      for (const call of res.calls) {
        if (failed) { results.push({ call_id: call.call_id, ok: false, error: 'Not executed: an earlier action in this turn failed.' }); continue; }
        const input = call.name === 'file_upload' ? { ...call.input, paths: [RESUME], document_ids: undefined } : call.input;
        // the Submit gate, as the extension will enforce it: no submit press unless the backend allowed it
        if ((call.name === 'left_click' || call.name === 'double_click') && call.input?.target?.type === 'ref' && !res.submit_allowed) {
          const info = await browser.describe(call.input.target.ref);
          if (info?.isSubmit) { results.push({ call_id: call.call_id, ok: false, error: 'Refused: Submit is not allowed yet. Answer SUBMIT_READY when the form is complete.' }); failed = true; journal.push(`refused submit ${info.text}`); continue; }
        }
        const r = await browser.exec(call.name, input);
        journal.push(`${call.name} ${JSON.stringify(call.input).slice(0, 120)} -> ${r.ok ? (r.text ?? 'image').slice(0, 80) : 'ERR ' + r.error}`);
        if (!r.ok) failed = true;
        results.push({ call_id: call.call_id, ...r });
      }
      req = { event: 'results', results };
    }
  } finally {
    const tree = await browser.finalTree().catch(() => '');
    const png = await browser.png().catch(() => '');
    await browser.close();
    mkdirSync('out', { recursive: true });
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    writeFileSync(`out/remote-${item.provider}-${stamp}.json`, JSON.stringify({ item: item.id, jobId, outcome, seconds: Math.round((Date.now() - started) / 1000), journal, tree }, null, 2));
    if (png) writeFileSync(`out/remote-${item.provider}-${stamp}.png`, Buffer.from(png, 'base64'));
    console.log(`\n== ${item.provider} outcome=${JSON.stringify(outcome)} time=${Math.round((Date.now() - started) / 1000)}s`);
    console.log(tree.split('\n').filter((l) => /required|combobox|file-input|checkbox/.test(l)).slice(0, 25).join('\n'));
    const status = await ext(`/items/${item.id}/v3/status`, undefined, 'GET').catch(() => ({}));
    console.log('status', JSON.stringify(status));
    // hand the item back so the seeker's panel does not show a phantom 'working' item (Submit was never pressed)
    if (!(outcome && ['confirmed', 'refused', 'unconfirmed'].includes(String(outcome.kind)))) await web(`/extension/items/${item.id}/release`, {}).catch(() => null);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
