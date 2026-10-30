// Engine v3 loop, the same on every site: ask the backend brain for the next browser actions, run them in
// order (the first failure stops the turn; the rest are answered "not executed"), post the results, repeat,
// until the brain reports an outcome. Pure and injected (no chrome.* here).
//
// What the model says is never taken on faith:
//   - SUBMIT_READY arms the item on the server FIRST; only then (auto-submit on) does the brain get to press Submit, once;
//   - CONFIRMED counts only when the quoted text is really on the page; otherwise it is "unconfirmed" (VERIFY, never a resend);
//   - a human check seen by the page itself stops the run, whatever the model said.
import type { AskQuestion, BrowserCall, CallResult, TurnRequest, TurnResponse } from './contract';

export type V3Result =
  | { kind: 'confirmed'; marker: string }
  | { kind: 'ready' } // armed; the person presses Submit (auto-submit is off)
  | { kind: 'unconfirmed' } // Submit pressed, nothing proved it: VERIFY, never resend
  | { kind: 'skip'; reason: 'closed' | 'already_applied'; why: string }
  | { kind: 'needs-user'; why: string; resume?: 'seeker_answer' | 'solved'; stop?: StopKind; ask?: AskQuestion[] }; // resume: the event that continues this conversation; stop: what kind of stop, so the panel draws the right card
// Why a run stopped for the person: a question (a form to answer), a human check on the page, the site's refusal, the
// brain giving up, Plato's own failure (server, network), or the job's tab gone. Each gets its own card and buttons.
export type StopKind = 'ask' | 'captcha' | 'refused' | 'blocked' | 'error' | 'lost';
export const askFallback = (question: string): AskQuestion[] => [{ id: 'answer', label: question, type: 'textarea', required: true }];

export interface V3RunDeps {
  turn(req: TurnRequest): Promise<TurnResponse>;
  exec(call: BrowserCall, submitAllowed: boolean): Promise<CallResult>;
  pageText(): Promise<string>; // to check a CONFIRMED quote against the page
  captcha(): Promise<boolean>; // the page shows a human check (dom/page-state.ts)
  arm(): Promise<void>; // record "about to submit" on the server; throws if not acknowledged
  pressed?: () => boolean; // the executor really pressed Submit in this run (executor.submitPressed)
  autoSubmit: boolean;
  jot(line: string): void;
  sleep(ms: number): Promise<void>;
}

const MAX_TURNS = 60; // the backend caps the model at 40; this is the executor's own guard
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
  let req = first;
  let errors = 0;
  let submitted = first.event === 'submit'; // the brain was allowed to press Submit (once); a run that begins at Submit (armed item, "Submit for me") counts it
  for (let t = 0; t < MAX_TURNS; t++) {
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
          if (!d.autoSubmit) return { kind: 'ready' };
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
          return { kind: 'needs-user', why: `The site did not accept the submission. Its words: “${o.quote.slice(0, 200)}”`, stop: 'refused' };
        case 'unconfirmed':
          return { kind: 'unconfirmed' };
        case 'captcha':
          return { kind: 'needs-user', why: `${o.text.replace(/^CAPTCHA[:\s\-—–]*/i, '').trim() || 'A human check (captcha) appeared on the page.'} ${NO_SOLVE}`.slice(0, 400), resume: 'solved', stop: 'captcha' };
        case 'ask':
          return { kind: 'needs-user', why: o.question, resume: 'seeker_answer', stop: 'ask', ask: o.questions?.length ? o.questions : askFallback(o.question) };
        case 'closed':
          return { kind: 'skip', reason: /already/i.test(o.reason) ? 'already_applied' : 'closed', why: o.reason };
        case 'blocked':
          return { kind: 'needs-user', why: o.reason, stop: 'blocked' };
        case 'error':
          if (++errors >= MAX_ERRORS) return { kind: 'needs-user', why: `Plato's AI could not be reached (${o.message.slice(0, 120)}). Nothing was typed or sent since the last step. Try again in a moment.`, stop: 'error' };
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
    if (await d.captcha().catch(() => false)) return { kind: 'needs-user', why: CAPTCHA_WHY, resume: 'solved', stop: 'captcha' };
    req = { event: 'results', results };
  }
  return { kind: 'needs-user', why: 'The application took more steps than Plato goes through on its own. Open the tab to see where it stands; Try again continues from there.', stop: 'blocked' };
}
