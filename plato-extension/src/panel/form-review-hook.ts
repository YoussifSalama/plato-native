import type { Api } from '../core/api';
import { FORM_FILL } from '../core/messages';
import { createFormReview, type FormReview } from '../core/form-review';
import { profileFromCandidate } from '../core/profile';
import type { FillInstruction, FillOutcome } from '../dom/types';
import { TRUSTED_KINDS, type Trusted } from './trusted';

// Runs the generic form review against a tab. Fills go to the content script, except the kinds that
// need a real press (comboboxes, boxes): those go through trusted input when the debugger is attached.
export const startFormReview = async (ctx: { api: Api; itemId: string; tabId: number; scope?: 'dialog'; trusted?: Trusted | null }): Promise<FormReview | null> => {
  const profile = profileFromCandidate(await ctx.api.candidate(ctx.itemId));
  // a page that never answers must not hang the run: the error names the message (it lands in the journal)
  const page = (m: unknown) =>
    Promise.race([
      chrome.tabs.sendMessage(ctx.tabId, m),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`page message ${(m as { type?: string }).type ?? ''} did not answer in 60s`)), 60_000)),
    ]);
  const send = async (m: unknown) => {
    const msg = m as { type: string; formId: string; instructions?: FillInstruction[] };
    if (msg.type !== FORM_FILL || !ctx.trusted?.isAttached(ctx.tabId) || !msg.instructions) return page(m);
    const mine = msg.instructions.filter((i) => i.kind && TRUSTED_KINDS.has(i.kind));
    const theirs = msg.instructions.filter((i) => !(i.kind && TRUSTED_KINDS.has(i.kind)));
    let a: FillOutcome['results'];
    try {
      a = mine.length ? await ctx.trusted.fill(ctx.tabId, msg.formId, mine) : [];
    } catch (e) {
      // a real-mouse step failed: report each of these fields as failed, with the reason, instead of hanging
      const why = e instanceof Error ? e.message : String(e);
      a = mine.map((i) => ({ fieldId: i.fieldId, status: 'failed' as const, reason: `trusted-input: ${why}`.slice(0, 120) }));
    }
    const b = theirs.length ? ((await page({ ...msg, instructions: theirs })) as FillOutcome | { error: string }) : { results: [], submitAttempts: 0 };
    if ('error' in b) return b;
    return { results: [...a, ...b.results], submitAttempts: b.submitAttempts } satisfies FillOutcome;
  };
  const ctl = createFormReview({ send, profile, scope: ctx.scope });
  await ctl.start();
  return ctl;
};
