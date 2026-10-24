import { FORM_FILL, FORM_INSPECT, FORM_LIST, FORM_VERIFY } from './messages';
import { mapFields } from '../dom/mapper';
import { norm } from '../dom/text';
import type { FieldInfo, FieldValue, FillOutcome, FillResult, FormInfo, FormList, Inspection, Mapping, Profile } from '../dom/types';

// The review the person works through before anything is filled, and the
// bounded loop around it. Everything the page is told to do is something the
// person approved in the CURRENT review state (see `version`). There is no
// message that submits; the person presses Submit.
export type Send = (message: unknown) => Promise<unknown>;

export const MAX_FILL_ROUNDS = 3; // existing bounded dynamic-field policy
export const MAX_ATTEMPTS = 3; // per field, retries included

export type Category = 'proposed' | 'low-confidence' | 'ambiguous' | 'already-filled' | 'consent' | 'unsupported' | 'duplicate' | 'no-value' | 'unmapped';
export type RowStatus = 'pending' | 'filled' | 'failed' | 'stale' | 'user-edited' | 'ineligible';

export interface Row {
  id: string;
  fp: string;
  vh: string; // the value hash the person saw: the field must still hold it to be filled
  label: string;
  required: boolean;
  hasValue?: boolean; // the field held a value when inspected (a ticked box, a chosen option)
  form?: string; // whole-page review: the form this field sits in
  name?: string; // the control's name / id (an upload called "resume")
  kind?: FieldInfo['kind']; // what the field is (for answering it)
  ftype?: string; // native type / tag (textarea, text, ...)
  options?: { value: string; label: string }[]; // choices of a select / radio group (or a combobox, once opened)
  optionsTotal?: number; // a combobox's full list size (a long list is not sent to the AI: it types the value instead)
  category: Category;
  /** Locked rows cannot be switched to Use: sensitive-adjacent, consent, unsupported, ambiguous, already filled, nothing to fill. */
  locked: boolean;
  lockReason?: string;
  choice: 'use' | 'skip';
  proposed?: FieldValue;
  shown?: string; // the proposed value as a person reads it (option label for selects)
  key?: string;
  source?: string; // why this field was matched (autocomplete / label / type)
  confidence?: number;
  status: RowStatus;
  reason?: string;
  attempts: number;
  vhAfter?: string; // value hash after our last attempt: the baseline a retry must still find
  note?: string;
  error?: string; // the page's own error text for this field, as last inspected
}

export interface ReviewState {
  /** Bumped by every change. A Fill is only valid for the version the person saw. */
  version: number;
  phase: 'choosing-form' | 'reviewing' | 'round-limit';
  forms: FormInfo[];
  formId?: string;
  formLabel?: string;
  rows: Row[];
  sensitiveExcluded: number;
  hidden: number;
  fillRounds: number;
  submitAttempts: number;
  notes: string[];
  error?: string;
}

const LOCK: Record<Category, string | undefined> = {
  proposed: undefined,
  'low-confidence': undefined,
  ambiguous: 'Could be more than one thing: Plato will not guess',
  'already-filled': 'Already has a value: Plato never overwrites',
  consent: 'Consent and choices are yours to make',
  unsupported: 'Plato cannot fill this kind of field',
  duplicate: 'Another field looks the same: Plato will not guess',
  'no-value': 'Nothing to fill it with',
  unmapped: 'Not a field Plato fills',
};

const shownValue = (f: FieldInfo, v: FieldValue) => (f.kind === 'select' ? f.options?.find((o) => o.value === v)?.label ?? String(v) : String(v));

/** Rows for one inspection. Safe defaults: only high-confidence mappings start as Use. */
export function buildRows(i: Inspection, profile: Profile): Row[] {
  const { mappings, held } = mapFields(i.fields, profile);
  const m = new Map<string, Mapping>(mappings.map((x) => [x.fieldId, x]));
  const h = new Map(held.map((x) => [x.fieldId, x]));
  const rows: Row[] = i.fields.map((f) => {
    const base = { id: f.id, fp: f.fp, vh: f.vh, label: f.label || '(unlabelled field)', required: f.required, hasValue: f.hasValue, form: f.form, name: f.name, kind: f.kind, ftype: f.type, error: f.error, options: f.options?.filter((o) => !o.disabled && !o.placeholder).slice(0, 60).map((o) => ({ value: o.value, label: o.label })), status: 'pending' as const, attempts: 0 };
    const mm = m.get(f.id);
    if (mm) return { ...base, category: 'proposed' as const, locked: false, choice: 'use' as const, proposed: mm.value, shown: shownValue(f, mm.value), key: mm.key, source: mm.why, confidence: mm.confidence };
    const hh = h.get(f.id)!;
    const cat: Category =
      hh.reason === 'low-confidence' ? 'low-confidence'
      : hh.reason === 'ambiguous' ? 'ambiguous'
      : hh.reason === 'already-filled' ? 'already-filled'
      : hh.reason === 'needs-you' ? 'consent'
      : hh.reason === 'duplicate-label' || hh.reason === 'duplicate-key' ? 'duplicate'
      : hh.reason === 'no-profile-value' || hh.reason === 'no-matching-option' ? 'no-value'
      : 'unmapped';
    const p = cat === 'low-confidence' ? hh.proposal : undefined;
    return {
      ...base,
      category: cat,
      locked: !p,
      lockReason: p ? undefined : LOCK[cat],
      choice: 'skip' as const,
      ...(p && { proposed: p.value, shown: shownValue(f, p.value), key: p.key, source: p.why, confidence: p.confidence }),
      ...(hh.candidates?.length && !p && { key: hh.candidates.join(' / ') }),
    };
  });
  for (const u of i.unsupported)
    rows.push({ id: u.id, fp: '', vh: '', label: u.label || '(unlabelled field)', required: u.required, category: 'unsupported', locked: true, lockReason: LOCK.unsupported, choice: 'skip', reason: u.reason, status: 'pending', attempts: 0 });
  return rows;
}

/**
 * Carry a review across a fresh inspection. Anything whose identity changed
 * loses its approval; anything the person (or the page) changed is left alone.
 */
// "X is required" / "can't be empty" on a field that holds a value describes an earlier, empty state: sites that
// validate only on Submit leave it on screen after the field is filled (Greenhouse, 2026-10-24). Before a Submit
// it is no rejection; after a Submit every page error counts again (afterSubmit reads them all).
export const EMPTY_ERROR = /\b(is required|required field|this field is required|can ?not be (left )?(empty|blank)|cannot be (left )?(empty|blank)|must not be (empty|blank)|please (enter|fill|select|choose|provide))\b/i;
export const blockingError = (r: { error?: string; hasValue?: boolean; status?: string }) => !!r.error && !((r.hasValue || r.status === 'filled') && EMPTY_ERROR.test(r.error));

export function mergeRows(prev: Row[], next: Row[]): { rows: Row[]; notes: string[] } {
  const notes: string[] = [];
  const before = new Map(prev.map((r) => [r.id, r]));
  const rows = next.map((n): Row => {
    const p = before.get(n.id);
    if (!p) return { ...n, note: prev.length ? 'New: appeared since the last look' : undefined };
    if (p.fp !== n.fp) return { ...n, choice: 'skip', note: 'Changed on the page: your earlier choice was cleared. Review it again' };
    // Marked user-edited and still in exactly that state: keep the mark. Changed again: look at it fresh.
    if (p.status === 'user-edited') return n.vh === p.vhAfter ? { ...p, label: n.label } : { ...n, choice: 'skip', note: 'You changed this: Plato leaves it alone' };
    const edited = (baseline: string) => n.vh !== baseline;
    if (p.status === 'filled') {
      // the page now shows an error on a value we wrote (seen after a Submit): ours to repair, with that reason
      if (n.error && !(n.hasValue && EMPTY_ERROR.test(n.error)) && !edited(p.vhAfter ?? p.vh)) return { ...p, label: n.label, vh: n.vh, error: n.error, status: 'failed', reason: 'page-rejected', choice: 'use', locked: false, note: n.error };
      if (!edited(p.vhAfter ?? p.vh)) return { ...p, label: n.label, vh: n.vh, error: undefined };
      // emptied again (a page widget reset it): ours to fill once more; changed to something else: the person's
      if (!n.hasValue && p.proposed !== undefined) return { ...n, status: 'failed', reason: 'page-cleared', choice: 'use', locked: false, proposed: p.proposed, shown: p.shown, source: p.source, confidence: p.confidence, attempts: p.attempts };
      return { ...n, status: 'user-edited', locked: true, choice: 'skip', lockReason: 'You changed this after Plato filled it', vhAfter: n.vh };
    }
    if (p.status === 'failed') return edited(p.vhAfter ?? p.vh) ? { ...n, status: 'user-edited', locked: true, choice: 'skip', lockReason: 'You changed this: Plato leaves it alone', note: 'You changed this: Plato leaves it alone' } : { ...p, label: n.label };
    if (p.status === 'stale' || p.status === 'ineligible') return { ...n, choice: 'skip', note: 'Changed on the page: review it again' };
    if (edited(p.vh) && !n.locked) return { ...n, status: 'user-edited', locked: true, choice: 'skip', lockReason: 'You changed this: Plato leaves it alone', note: 'You changed this: Plato leaves it alone', vhAfter: n.vh };
    return { ...n, choice: n.locked ? 'skip' : p.choice, attempts: p.attempts };
  });
  const gone = prev.filter((p) => !rows.some((r) => r.id === p.id));
  if (gone.length) notes.push(`${gone.length} field(s) disappeared from the page`);
  return { rows, notes };
}

const STALE = new Set(['stale-field', 'stale-form', 'no-such-field']);
// A new value may go into a field that is empty, failed or went stale; never one the person edited.
const RETRYABLE = new Set<string>(['pending', 'failed', 'stale']);

export function createFormReview(deps: { send: Send; profile: Profile; maxRounds?: number; scope?: 'dialog' }) {
  const { send, profile } = deps;
  const maxRounds = deps.maxRounds ?? MAX_FILL_ROUNDS;
  let s: ReviewState = { version: 0, phase: 'choosing-form', forms: [], rows: [], sensitiveExcluded: 0, hidden: 0, fillRounds: 0, submitAttempts: 0, notes: [] };
  const set = (patch: Partial<ReviewState>) => (s = { ...s, ...patch, version: s.version + 1 });

  const inspect = async (formId: string) => {
    const r = (await send({ type: FORM_INSPECT, formId })) as Inspection | { error: string };
    if ('error' in r) throw new Error(r.error);
    return r;
  };

  async function load(formId: string, formLabel: string | undefined, keepRows: Row[]) {
    try {
      const i = await inspect(formId);
      const built = buildRows(i, profile);
      const { rows, notes } = keepRows.length ? mergeRows(keepRows, built) : { rows: built, notes: [] as string[] };
      set({ phase: s.fillRounds >= maxRounds ? 'round-limit' : 'reviewing', formId, formLabel, rows, sensitiveExcluded: i.sensitiveExcluded, hidden: i.hidden, notes, error: undefined });
    } catch {
      set({ error: 'The form is no longer on the page. Re-inspect, or choose the form again.' });
    }
  }

  return {
    get: () => s,

    /** List forms. One certain form is used; otherwise the person must choose. */
    async start() {
      const list = (await send({ type: FORM_LIST, ...(deps.scope && { scope: deps.scope }) })) as FormList;
      set({ forms: list.forms, rows: [], formId: undefined, fillRounds: 0 });
      if (list.selected) {
        const f = list.forms.find((x) => x.id === list.selected);
        await load(list.selected, f?.label, []);
      } else set({ phase: 'choosing-form', notes: ['More than one form on this page. Choose the one for this application.'] });
      return s;
    },

    /** Selections and approvals never cross forms: choosing starts that form's review from scratch. */
    async chooseForm(formId: string) {
      const f = s.forms.find((x) => x.id === formId);
      if (!f) return s;
      set({ rows: [], fillRounds: 0, formId: undefined });
      await load(formId, f.label, []);
      return s;
    },

    /** Look again after the page changed. Stale approvals are cleared, new fields appear for review. */
    async reinspect() {
      if (!s.formId) return s;
      await load(s.formId, s.formLabel, s.rows);
      return s;
    },

    /** What a combobox offers (read by opening it): the AI picks from these like a select. */
    setOptions(id: string, options: { value: string; label: string }[], total: number) {
      set({ rows: s.rows.map((x) => (x.id === id ? { ...x, options: options.slice(0, 60), optionsTotal: total } : x)) });
      return s;
    },

    toggle(id: string, choice: 'use' | 'skip') {
      const r = s.rows.find((x) => x.id === id);
      if (!r || r.locked || r.status === 'filled' || r.status === 'user-edited') return s;
      if (choice === 'use' && (r.proposed === undefined || r.status === 'stale' || r.status === 'ineligible')) return s;
      set({ rows: s.rows.map((x) => (x.id === id ? { ...x, choice } : x)) });
      return s;
    },

    /**
     * Give a field an answer (a drafted one, or one the seeker typed) so the normal approved-fill
     * path writes it, with the same fingerprint and "never overwrite" checks. Consent, sensitive
     * and already-filled fields cannot be proposed. `value` for choices is an option label or value.
     */
    propose(id: string, raw: string | boolean | number | string[], source: string) {
      // the AI may send true/false, a number or a list: one text form here, never a crash on .trim()
      const value = Array.isArray(raw) ? raw.join(' | ') : typeof raw === 'boolean' ? (raw ? 'yes' : 'no') : String(raw ?? '');
      const r = s.rows.find((x) => x.id === id);
      if (!r || !RETRYABLE.has(r.status) || r.category === 'consent' || r.category === 'already-filled' || r.category === 'unsupported' || !r.kind) return s;
      let v: FieldValue = value;
      let shown = value;
      // exact value or label, else the option the answer clearly means (a letter "A", or one text containing the other)
      const option = (want: string) => {
        const opts = r.options ?? [];
        const w = norm(want);
        const hit = opts.find((x) => x.value === want || norm(x.label) === w);
        if (hit || !w) return hit;
        const letter = /^([a-z0-9])[.)]?$/.exec(w)?.[1];
        if (letter) return opts.find((x) => new RegExp(`^${letter}[.)\\s]`).test(norm(x.label)));
        const contains = opts.filter((x) => norm(x.label).includes(w) || w.includes(norm(x.label)));
        return contains.length === 1 ? contains[0] : undefined;
      };
      if (r.kind === 'select' || r.kind === 'radio') {
        const o = option(value);
        if (!o) return s; // never invent an option
        v = o.value;
      } else if (r.kind === 'checkbox-group') {
        // "A | B": every named option must exist; the ticks are exactly those
        const picks = value.split('|').map((x) => option(x.trim()));
        if (!picks.length || picks.some((o) => !o)) return s;
        v = picks.map((o) => o!.value);
        shown = picks.map((o) => o!.label).join(' | ');
      } else if (r.kind === 'checkbox') {
        if (!/^(yes|no|true|false)$/i.test(value.trim())) return s;
        v = /^(yes|true)$/i.test(value.trim());
        shown = v ? 'ticked' : 'left unticked';
      }
      set({ rows: s.rows.map((x) => (x.id === id ? { ...x, status: 'pending' as const, reason: undefined, proposed: v, shown, choice: 'use' as const, locked: false, lockReason: undefined, source, confidence: 1 } : x)) });
      return s;
    },

    /** Fill exactly the approved fields, for the review the person saw. */
    async fillApproved(seenVersion: number) {
      if (seenVersion !== s.version) return set({ error: 'The review changed. Look at it again, then fill.' });
      if (!s.formId) return s;
      if (s.fillRounds >= maxRounds) return set({ phase: 'round-limit', error: 'Round limit reached. Do the rest on the page yourself.' });
      const targets = s.rows.filter((r) => r.choice === 'use' && !r.locked && r.status === 'pending' && r.proposed !== undefined);
      if (!targets.length) return set({ error: 'Nothing is approved to fill.' });
      await attempt(targets);
      return s;
    },

    /** Retry only the fields that failed, each against its own baseline. Successful fields are not sent again. */
    async retryFailed(seenVersion: number) {
      if (seenVersion !== s.version) return set({ error: 'The review changed. Look at it again, then retry.' });
      if (!s.formId) return s;
      const targets = s.rows.filter((r) => r.status === 'failed' && r.choice === 'use' && !r.locked && r.proposed !== undefined && r.attempts < MAX_ATTEMPTS);
      if (!targets.length) return set({ error: 'Nothing to retry.' });
      await attempt(targets, true);
      return s;
    },
  };

  async function attempt(targets: Row[], retry = false) {
    const formId = s.formId!;
    // A retry expects the field to hold what OUR failed attempt left behind. If the person changed it, the engine refuses.
    const instructions = targets.map((r) => ({ fieldId: r.id, fp: r.fp, vh: retry ? (r.vhAfter ?? r.vh) : r.vh, value: r.proposed!, kind: r.kind }));
    const outcome = (await send({ type: FORM_FILL, formId, instructions })) as FillOutcome | { error: string };
    if ('error' in outcome) return void set({ error: 'The form is no longer on the page. Re-inspect, or choose the form again.' });
    const byId = new Map(outcome.results.map((r) => [r.fieldId, r]));
    let rows = s.rows.map((row): Row => {
      const r = byId.get(row.id);
      // a target that got no read-back at all is not 'still pending': the page gave nothing for it
      if (!r) return targets.some((t) => t.id === row.id) ? { ...row, status: 'failed', attempts: row.attempts + 1, reason: 'no-result' } : row;
      if (r.status === 'filled') return { ...row, status: 'filled', attempts: row.attempts + 1, vhAfter: r.vh, reason: undefined, note: retry ? 'Filled on retry' : undefined };
      if (r.reason === 'user-edited') return { ...row, status: 'user-edited', locked: true, choice: 'skip', lockReason: 'You changed this: Plato leaves it alone', reason: r.reason, vhAfter: r.vh };
      if (STALE.has(r.reason ?? '') || r.reason === 'ineligible') return { ...row, status: r.reason === 'ineligible' ? 'ineligible' : 'stale', choice: 'skip', reason: r.reason, note: 'Changed on the page: review it again' };
      return { ...row, status: 'failed', attempts: row.attempts + 1, vhAfter: r.vh ?? row.vhAfter, reason: r.reason };
    });
    // Final read-back of what we filled this time: a page script may have reset it.
    const filled = rows.filter((r) => byId.get(r.id)?.status === 'filled' && r.status === 'filled');
    if (filled.length) {
      const check = (await send({ type: FORM_VERIFY, formId, expected: filled.map((r) => ({ fieldId: r.id, fp: r.fp, value: r.proposed! })) })) as FillResult[];
      const bad = new Map(check.filter((c) => c.status === 'failed').map((c) => [c.fieldId, c]));
      rows = rows.map((r) => (bad.has(r.id) ? { ...r, status: 'failed', reason: bad.get(r.id)!.reason, vhAfter: bad.get(r.id)!.vh } : r));
    }
    set({ rows, submitAttempts: s.submitAttempts + outcome.submitAttempts, fillRounds: s.fillRounds + (retry ? 0 : 1), error: undefined });
    // Newly revealed fields appear as rows to review; they are never filled by themselves.
    await load(formId, s.formLabel, s.rows);
  }
}
export type FormReview = ReturnType<typeof createFormReview>;
export type { FormList };
