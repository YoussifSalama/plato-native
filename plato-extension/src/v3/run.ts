// Engine v3 loop, the same on every site: ask the backend brain for the next browser actions, run them in
// order (the first failure stops the turn; the rest are answered "not executed"), post the results, repeat,
// until the brain reports an outcome. Pure and injected (no chrome.* here).
//
// What the model says is never taken on faith:
//   - SUBMIT_READY arms the item on the server FIRST; only then, and only when the backend's review says no hold, does
//     the brain get to press Submit, once (a held job stops for the seeker with the list of what was filled);
//   - CONFIRMED counts only when the quoted text is really on the page; otherwise it is "unconfirmed" (VERIFY, never a resend);
//   - a human check seen by the page itself stops the run, whatever the model said;
//   - before the brain acts on a page, the page's own structure is classified (dom/page-state.ts): an account to make or
//     a sign-in (with the seeker's "create accounts" setting off) or an email code stops the run before anything is typed;
//   - 3 action turns in a row that change nothing on the page (same kind, URL, fields and values) stop it too.
import type { PageState } from '../dom/page-state';
import type { AskQuestion, BrowserCall, CallResult, Review, TurnRequest, TurnResponse } from './contract';

export type V3Result =
  | { kind: 'confirmed'; marker: string }
  | { kind: 'ready'; review?: Review } // armed; the seeker checks the review and approves Submit (or presses it)
  | { kind: 'unconfirmed' } // Submit pressed, nothing proved it: VERIFY, never resend
  | { kind: 'skip'; reason: 'closed' | 'already_applied'; why: string }
  | { kind: 'needs-user'; why: string; resume?: 'seeker_answer' | 'solved' | 'continue'; stop?: StopKind; ask?: AskQuestion[]; code?: string; raw?: string; reason?: StopReason; states?: string[] }; // resume: the event that continues this conversation; stop: what kind of stop, so the panel draws the right card; code: the server's error code; raw: the error behind it (for us, never shown)
// Why a run stopped for the person: a question (a form to answer), a human check on the page, the site's refusal, the
// brain giving up, Plato's own failure (server, network), or the job's tab gone. Each gets its own card and buttons.
export type StopKind = 'ask' | 'captcha' | 'refused' | 'blocked' | 'error' | 'lost' | 'duplicate' | 'site' | 'loop'; // site: the seeker acts on the job site (account, sign-in, email code, an unknown page), then Continue
// Why a run stopped, as one code: the stop record's `reason` (POST /stops), counted by GET /admin/usage/v3. The panel's
// own stops use the same codes (panel/main.ts stopKind); keep them hyphenated like the older ones there.
export type StopReason = 'account-signup' | 'login' | 'email-verification' | 'captcha' | 'unknown-page' | 'loop' | 'too-many-steps' | 'ai-error' | 'ai-asked' | 'blocked' | 'refused' | 'server-error' | 'page-lost';
type SitePage = 'ACCOUNT_SIGNUP' | 'LOGIN' | 'EMAIL_VERIFICATION' | 'UNKNOWN';
export const SITE_WHY: Record<SitePage, string> = {
  ACCOUNT_SIGNUP: 'This site requires creating an account. Create it in the job’s tab, then click Continue.',
  LOGIN: 'This site asks you to sign in to an account that already exists for your email. Plato did not make it, so it does not know the password. Sign in in the job’s tab, then click Continue.',
  EMAIL_VERIFICATION: 'The site sent a code or a link to your email. Enter the code (or open the link) in the job’s tab, then click Continue.',
  UNKNOWN: 'Plato is not sure what this page is and will not guess. Look at the job’s tab, move it to the application if you can, then click Continue.',
};
const SITE_REASON: Record<SitePage, StopReason> = { ACCOUNT_SIGNUP: 'account-signup', LOGIN: 'login', EMAIL_VERIFICATION: 'email-verification', UNKNOWN: 'unknown-page' };
export const LOOP_WHY = 'Plato is going in circles on this page: its last 3 actions changed nothing. Look at the job’s tab; Continue picks up from the page as it is.';
export const TOO_MANY_WHY = 'The application ran longer than Plato goes on its own. Open the tab to see where it stands; Try again continues from there.';
// The presses and entries that should change the page; reads, screenshots, scrolls and waits do not count toward a loop.
const ACTIONS = new Set(['left_click', 'double_click', 'triple_click', 'right_click', 'type', 'key', 'form_input', 'file_upload']);
const SAME_LIMIT = 3; // ponytail: 3 action turns with no change on the page; raise it if slow pages trip it
/** The site's own words that this person already applied ("This email ... has already been used to apply for this job"). */
export const ALREADY_APPLIED = /already (been )?(used to )?appl(y|ied)|already (submitted|sent) (an |your )?application|(you|you've|you have) (already )?applied (to|for) this|duplicate application|application (for this (job|position|role) )?already exists/i;
// A short code the seeker can copy and send us; GET /admin/errors?code= (backend) finds the stop by it.
// No 0/O/1/I. Same alphabet as plato-native-be src/modules/extension/v3/v3-results.ts errorCode().
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => `PL-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % 32]).join('')}`;
export const askFallback = (question: string): AskQuestion[] => [{ id: 'answer', label: question, type: 'textarea', required: true }];

export interface V3RunDeps {
  turn(req: TurnRequest): Promise<TurnResponse>;
  exec(call: BrowserCall, submitAllowed: boolean): Promise<CallResult>;
  pageText(): Promise<string>; // to check a CONFIRMED quote against the page
  page(): Promise<PageState | undefined>; // what the page is now (dom/page-state.ts): kind, human check, signature
  createAccounts?: boolean; // the seeker's setting: Plato may make and sign in to job-site accounts
  arm(): Promise<void>; // record "about to submit" on the server; throws if not acknowledged
  pressed?: () => boolean; // the executor really pressed Submit in this run (executor.submitPressed)
  autoSubmit: boolean; // this build may press Submit at all (off: a --submit=off live-test build, the fixtures setting)
  jot(line: string): void;
  sleep(ms: number): Promise<void>;
}

const MAX_ERRORS = 3; // consecutive brain failures (network, model) before the seeker is told
export const NO_SOLVE = 'Plato does not solve human checks. Solve it in the job’s tab, then press “I solved it, continue”.';
export const CAPTCHA_WHY = `The page shows a human check (captcha). ${NO_SOLVE}`; // the page itself detected it

// The model's quoted proof must really be on the page: no confirmation from thin air.
export const onPage = (quote: string, text: string) => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const q = n(quote);
  return q.length >= 12 && n(text).includes(q);
};
const brief = (c: BrowserCall) => {
  const i = c.input ?? {};
  const t = i.target as { ref?: string; x?: number; y?: number } | undefined;
  const where = t?.ref ?? (t && typeof t.x === 'number' ? `${t.x},${t.y}` : '');
  const what = c.name === 'type' ? JSON.stringify(String(i.text ?? '').slice(0, 40)) : c.name === 'form_input' ? JSON.stringify(String(i.value ?? '').slice(0, 40)) : c.name === 'navigate' ? String(i.url ?? '').slice(0, 80) : c.name === 'key' ? String(i.text ?? '') : '';
  return `${c.name}${where ? ` ${where}` : ''}${what ? ` ${what}` : ''}`;
};

export async function runV3(d: V3RunDeps, first: TurnRequest = { event: 'start' }): Promise<V3Result> {
  const seen: string[] = []; // every page the run classified, for the stop record
  const r = await loop(d, first, seen);
  return r.kind === 'needs-user' ? { ...r, states: seen.slice(-5) } : r;
}

async function loop(d: V3RunDeps, first: TurnRequest, seen: string[]): Promise<V3Result> {
  let submitted = first.event === 'submit'; // the brain was allowed to press Submit (once); a run that begins at Submit (armed item, "Submit for me") counts it
  // The page before the brain acts on it. The seeker just pressed Continue / "I solved it" on this page: the structure may
  // still look the same (a lingering banner, an optional password box), so it does not stop the run again until the
  // page moves on; the brain's own reading still can.
  const look = async () => {
    const p = await d.page().catch(() => undefined);
    if (p) {
      seen.push(`${p.kind} ${p.href.slice(0, 200)}`);
      d.jot(`Page: ${p.kind} ${p.href.slice(0, 120)} (${p.fields} fields)`);
    }
    return p;
  };
  const pageOf = (p?: PageState) => (p ? { kind: p.kind, url: p.href.slice(0, 4000), fields: p.fields } : undefined);
  let p = await look();
  const waived = first.event === 'continue' || first.event === 'solved' ? p?.href : undefined;
  const siteStop = (pg?: PageState): V3Result | null => {
    if (!pg || pg.href === waived) return null;
    if (pg.captcha) return { kind: 'needs-user', why: CAPTCHA_WHY, resume: 'solved', stop: 'captcha', reason: 'captcha' };
    if (submitted) return null; // after the one press the brain reads the page and says what happened
    const k = pg.kind;
    if (k === 'EMAIL_VERIFICATION' || (!d.createAccounts && (k === 'ACCOUNT_SIGNUP' || k === 'LOGIN'))) return { kind: 'needs-user', why: SITE_WHY[k], resume: 'continue', stop: 'site', reason: SITE_REASON[k] };
    return null;
  };
  const early = siteStop(p);
  if (early) return early;
  let lastSig = p?.sig;
  let same = 0;
  let req: TurnRequest = { ...first, ...(p && { page: pageOf(p) }) };
  let errors = 0;
  // no step cap (owner 2026-11-24): the backend gives the model 5 minutes at a time and it renews or stops itself
  for (;;) {
    let res: TurnResponse;
    try {
      res = await d.turn(req);
    } catch (e) {
      // Submit was pressed and now the brain is gone (backend restart, 500, network): the form may well be sent.
      // Never "lost the page" (whose Try again starts over and navigates off the confirmation): check the page, else VERIFY.
      if (!d.pressed?.()) throw e;
      d.jot(`Plato could not be reached after Submit (${(e instanceof Error ? e.message : String(e)).slice(0, 120)}): checking the page itself.`);
      return { kind: 'unconfirmed' };
    }
    if ('outcome' in res) {
      const o = res.outcome;
      if (o.kind !== 'error') d.jot(`Turn ${res.turn}: ${o.kind}${'summary' in o ? ` — ${o.summary}` : 'question' in o ? ` — ${o.question}` : 'reason' in o ? ` — ${o.reason}` : 'quote' in o ? ` — “${o.quote}”` : ''}`);
      switch (o.kind) {
        case 'submit_ready': {
          if (submitted) return { kind: 'unconfirmed' }; // pressed once already; the page did not say what happened
          await d.arm(); // recorded on the server BEFORE anyone is told the form is ready
          // no review (an older backend) is a hold too: Submit without a stop needs the backend's explicit hold: false
          if (!d.autoSubmit || o.review?.hold !== false) return { kind: 'ready', ...(o.review && { review: o.review }) };
          submitted = true;
          req = { event: 'submit' }; // the gate lifts for exactly one press
          continue;
        }
        case 'confirmed': {
          const text = await d.pageText().catch(() => '');
          if (onPage(o.quote, text)) return { kind: 'confirmed', marker: `page:${o.quote.slice(0, 120)}` };
          d.jot('The quoted confirmation is not on the page: not counted.');
          return { kind: 'unconfirmed' };
        }
        case 'refused':
          return { kind: 'needs-user', why: `The site did not accept the submission. Its words: “${o.quote.slice(0, 200)}”`, stop: 'refused', reason: 'refused' };
        case 'unconfirmed':
          return { kind: 'unconfirmed' };
        case 'captcha':
          return { kind: 'needs-user', why: `${o.text.replace(/^CAPTCHA[:\s\-—–]*/i, '').trim() || 'A human check (captcha) appeared on the page.'} ${NO_SOLVE}`.slice(0, 400), resume: 'solved', stop: 'captcha', reason: 'captcha' };
        case 'ask':
          return { kind: 'needs-user', why: o.question, resume: 'seeker_answer', stop: 'ask', ask: o.questions?.length ? o.questions : askFallback(o.question), reason: 'ai-asked' };
        case 'site': // the brain's own reading: an account, a sign-in, an email code, or a page it cannot place
          return { kind: 'needs-user', why: o.page === 'UNKNOWN' && o.reason ? `Plato is not sure what this page is (${o.reason.slice(0, 160)}) and will not guess. Look at the job’s tab, move it to the application if you can, then click Continue.` : SITE_WHY[o.page], resume: 'continue', stop: 'site', reason: SITE_REASON[o.page], raw: o.reason };
        case 'closed':
          return { kind: 'skip', reason: /already/i.test(o.reason) ? 'already_applied' : 'closed', why: o.reason };
        case 'blocked':
          if (/^Turn limit/i.test(o.reason)) return { kind: 'needs-user', why: TOO_MANY_WHY, stop: 'blocked', reason: 'too-many-steps' };
          return { kind: 'needs-user', why: o.reason, stop: 'blocked', reason: 'blocked' };
        case 'error':
          d.jot(`Plato's AI call failed${o.code ? ` (${o.code})` : ''}: ${o.message.slice(0, 200)}`);
          if (o.fatal) return { kind: 'needs-user', why: 'Plato hit an internal error on this application and stopped. Nothing was typed or sent since the last step.', stop: 'error', code: o.code, raw: o.message, reason: 'ai-error' };
          if (++errors >= MAX_ERRORS) return { kind: 'needs-user', why: 'Plato’s AI is not answering right now. Nothing was typed or sent since the last step. Try again in a few minutes.', stop: 'error', code: o.code, raw: o.message, reason: 'ai-error' };
          await d.sleep(3000);
          continue; // the same event again
      }
    }
    errors = 0;
    const results: CallResult[] = [];
    let failed = false;
    for (const call of res.calls) {
      if (failed) {
        results.push({ call_id: call.call_id, ok: false, error: 'Not executed: an earlier action in this turn failed.' });
        continue;
      }
      const r = await d.exec(call, res.submit_allowed);
      d.jot(`${brief(call)} → ${r.ok ? (r.image ? 'image' : (r.text ?? 'done').split('\n')[0]!.slice(0, 60)) : `ERR ${r.error ?? ''}`}`);
      if (!r.ok) failed = true;
      results.push(r);
    }
    p = await look();
    const stop = siteStop(p);
    if (stop) return stop;
    // a loop: action turns that leave the page exactly as it was (read-only turns neither count nor reset it)
    if (p) {
      if (p.sig !== lastSig) same = 0;
      else if (res.calls.some((c) => ACTIONS.has(c.name)) && ++same >= SAME_LIMIT) return { kind: 'needs-user', why: LOOP_WHY, resume: 'continue', stop: 'loop', reason: 'loop' };
      lastSig = p.sig;
    }
    req = { event: 'results', results, ...(p && { page: pageOf(p) }) };
  }
}
