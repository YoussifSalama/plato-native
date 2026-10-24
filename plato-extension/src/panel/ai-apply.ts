
// The AI apply loop, the same on every site. Per page: inspect it, ONE AI decision (a value for
// every field, what is missing, the next move), fill and verify, repair only what actually failed,
// then make the move. The page is decided again only when it changed (navigation, Next, a new step,
// fields appearing); while it does not change there is no fill and no AI call, only a bounded wait.
// Pure and injected (no chrome.* here). A Submit is pressed at most once and never retried.
export type EaResult =
  | { kind: 'confirmed'; marker: string }
  | { kind: 'ready' } // armed; the person presses Submit (auto-submit is off)
  | { kind: 'unconfirmed' } // nothing proved the submission: VERIFY, never resend
  | { kind: 'skip'; reason: 'closed' | 'already_applied'; why: string } // nothing to apply to
  | { kind: 'needs-user'; why: string };
export interface AiMove {
  action: 'press' | 'wait' | 'ask' | 'skip' | 'done';
  ref: string | null;
  intent: 'open_apply' | 'next' | 'review' | 'submit' | 'other' | null;
  reason: string;
  skip_reason: 'closed' | 'already_applied' | 'not_a_job' | null;
  label?: string; // the pressed control's label, for the history
}
export interface PageLook {
  sig: string; // what the page shows (url, step, controls, fields): equal = nothing changed
  confirmed: string | null; // the page proves the submission ("Thank you for applying")
  loading?: boolean; // still loading: not a page to decide on
  text?: string; // the page's visible text: a quote the AI gives as proof must be found in it
}

// The AI's quoted proof ("Your application was already submitted") must really be on the page: no marker from thin air.
const onPage = (quote: string, text: string | undefined) => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const q = n(quote);
  return q.length >= 12 && !!text && n(text).includes(q);
};
export interface Decided extends AiMove {
  missing: string[]; // required fields the profile cannot answer, with why
}
export interface AiApplyDeps {
  look(): Promise<PageLook>;
  /** Resolves when the page itself says it is loaded and quiet (dom/settle.ts). Optional: tests and old pages compare looks. */
  settle?(): Promise<boolean>;
  /** Inspect the page and get the AI's one decision for it; its values are staged for fill(). */
  decide(history: { action: string; intent: string | null; label: string }[]): Promise<Decided>;
  /** Write the decision's values and read them back: the fields that did not stick, and whether filling revealed new fields (a material change: decided again). */
  fill(): Promise<{ failed: string[]; revealed: boolean }>;
  /** Only after fill() reported failures: the AI corrects those fields, they are written again. Returns what still failed. */
  repair(): Promise<string[]>;
  press(ref: string): Promise<{ clicked: boolean }>;
  /** Record "about to submit" on the server first. */
  arm(): Promise<void>;
  /** Submit was pressed and nothing proved it: re-inspect and return the page's per-field errors (empty = nothing shown). Optional. */
  afterSubmit?(): Promise<{ errors: string[]; captcha?: boolean; refused?: string }>; // refused: the page's own text saying it did not take the submission
  autoSubmit: boolean;
  sleep(ms: number): Promise<void>;
}

const MAX_PAGES = 16; // decisions per application
const MAX_IDLE = 5; // looks at an unchanged page before giving up
const SETTLE_MS = 800; // two looks this far apart must agree before a page is decided
const MAX_SETTLE = 12; // ~10 s for a slow page (Greenhouse re-renders its form seconds after load)
const MAX_SUBMITS = 2; // a second press only after the page's own errors were read and at least one field repaired

// The page as it is once it stops changing: loaded, and the same on two consecutive looks.
// Deciding on a half-rendered page wastes an AI call or presses the wrong thing.
async function settled(d: AiApplyDeps): Promise<PageLook> {
  if (d.settle && (await d.settle())) return d.look(); // the page's own signal: no guessing
  let a = await d.look();
  for (let i = 0; i < MAX_SETTLE; i++) {
    if (a.confirmed) return a;
    await d.sleep(SETTLE_MS);
    const b = await d.look();
    if (!b.loading && b.sig === a.sig) return b;
    a = b;
  }
  return a;
}

export async function runAiApply(d: AiApplyDeps): Promise<EaResult> {
  const history: { action: string; intent: string | null; label: string }[] = [];
  let seen = ''; // the page as it was after our last decision and fill
  let idle = 0;
  let stuck = 'The page did not change.';
  let submits = 0;
  for (let pages = 0; pages < MAX_PAGES; ) {
    const p = await settled(d);
    if (p.confirmed) return { kind: 'confirmed', marker: p.confirmed };
    if (p.sig === seen) {
      if (++idle >= MAX_IDLE) return { kind: 'needs-user', why: stuck };
      await d.sleep(1500);
      continue;
    }
    idle = 0;
    pages++;
    const mv = await d.decide(history);
    history.push({ action: mv.action, intent: mv.intent, label: mv.label ?? '' });
    const f = await d.fill();
    let failed = f.failed;
    if (failed.length) failed = await d.repair(); // only after a real failure
    if (f.revealed) continue; // new fields appeared (a city after the country): decide the page again before any move
    seen = (await d.look()).sig; // our own typing is not a page change
    const gaps = [...mv.missing, ...failed];
    const why = (s: string) => (gaps.length ? `${s} Still needed: ${gaps.join('; ')}` : s).slice(0, 190);

    if (mv.action === 'ask') {
      if (mv.intent === 'submit' && !gaps.length) {
        // auto-submit is off: everything is filled, the seeker presses Submit
        await d.arm();
        return { kind: 'ready' };
      }
      return { kind: 'needs-user', why: why(mv.reason) };
    }
    if (mv.action === 'skip') return { kind: 'skip', reason: mv.skip_reason === 'already_applied' ? 'already_applied' : 'closed', why: mv.reason };
    if (mv.action === 'done') {
      const proof = (await d.look()).confirmed;
      return proof ? { kind: 'confirmed', marker: proof } : { kind: 'unconfirmed' }; // the page must prove it
    }
    if (mv.action === 'wait') {
      stuck = why('The page did not settle.'); // decided again only once the page changes
      continue;
    }
    if (!mv.ref) return { kind: 'needs-user', why: 'The page planner named no control.' };
    if (gaps.length && mv.intent !== 'open_apply' && mv.intent !== 'other') return { kind: 'needs-user', why: why('Required fields are empty.') };
    if (mv.intent === 'submit') {
      if (submits >= MAX_SUBMITS) return { kind: 'unconfirmed' }; // never a third press
      await d.arm(); // recorded on the server BEFORE the press
      if (!d.autoSubmit) return { kind: 'ready' };
      submits++;
    }
    const r = await d.press(mv.ref);
    if (!r.clicked) return { kind: 'needs-user', why: `I could not press “${mv.label ?? mv.ref}”.` };
    if (mv.intent === 'submit') {
      for (let t = 0; t < 12; t++) {
        await d.sleep(1000);
        const proof = (await d.look()).confirmed;
        if (proof) return { kind: 'confirmed', marker: proof };
      }
      // No marker. The page may still say it in its own words (a thank-you page the patterns do not know,
      // or "already submitted"): ONE decision reads it; its quote must be on the page to count.
      if (pages < MAX_PAGES) {
        const after = await settled(d);
        if (after.confirmed) return { kind: 'confirmed', marker: after.confirmed };
        const read = await d.decide(history);
        pages++;
        history.push({ action: read.action, intent: read.intent, label: read.label ?? '' });
        if (read.action === 'done' && onPage(read.reason, after.text)) return { kind: 'confirmed', marker: `page:${read.reason.slice(0, 120)}` };
        if (read.action === 'skip' && read.skip_reason === 'already_applied' && onPage(read.reason, after.text)) return { kind: 'skip', reason: 'already_applied', why: read.reason };
      }
      // Nothing proved it. The page's own field errors (a required select, a rejected value) are the one
      // reason to try again: repair those fields and decide the page once more. No errors: unconfirmed, never a resend.
      if (d.afterSubmit && submits < MAX_SUBMITS) {
        const { errors, captcha, refused } = await d.afterSubmit();
        if (captcha) return { kind: 'needs-user', why: 'The site asks for a human check (captcha) before it accepts the application. Solve it on the page, then press Submit yourself.' };
        if (refused && !errors.length) return { kind: 'needs-user', why: `The site refused the submission: ${refused.slice(0, 160)}` };
        if (errors.length) {
          const still = await d.repair();
          if (still.length < errors.length) {
            seen = ''; // the page is decided again, with the errors in view
            stuck = 'The page did not change after the repair.';
            continue;
          }
          return { kind: 'needs-user', why: why(`The page rejected the application: ${errors.join('; ')}`) };
        }
      }
      return { kind: 'unconfirmed' }; // pressed; nothing on the page says why
    }
    stuck = `Pressing “${mv.label ?? mv.ref}” did not move the page.`; // the next look waits for the page to settle
  }
  return { kind: 'needs-user', why: 'The application has more steps than I will go through on my own.' };
}
