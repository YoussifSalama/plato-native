// The question form: what the brain could not answer from the profile, drawn as the control the answer needs
// (Yes/No pills, a choice list, several picks, a short value, a sentence) instead of a text box. Several
// questions become a stepper, one per step. "Something else" opens a free answer beside the options.
// The form paints itself in place on every interaction (no panel redraw), and keeps a draft per job so a
// panel redraw (a refresh tick) rebuilds it with the answers still in. Pure DOM, no innerHTML.
import type { AskQuestion } from '../v3/contract';
import { h } from './view';

export interface AskAnswer {
  id: string;
  label: string;
  value: string;
}
interface Draft {
  step: number;
  values: Record<string, string | string[]>;
  other: Record<string, string>; // the "Something else" text per question
}
const drafts = new Map<string, Draft>();
export const clearAskDraft = (key: string) => void drafts.delete(key);
export const OTHER = 'Something else';
const MAX_PILLS = 6; // more options than this: a select, not a wall of pills

const isOther = (d: Draft, q: AskQuestion) => d.values[q.id] === OTHER || (Array.isArray(d.values[q.id]) && (d.values[q.id] as string[]).includes(OTHER));
/** The answer as a sentence fragment, or '' when the question is unanswered. */
export function answerText(d: Draft, q: AskQuestion): string {
  const v = d.values[q.id];
  const other = (d.other[q.id] ?? '').trim();
  if (Array.isArray(v)) return [...v.filter((x) => x !== OTHER), ...(v.includes(OTHER) && other ? [other] : [])].join(', ');
  if (v === OTHER) return other;
  return (v ?? '').toString().trim();
}
const answered = (d: Draft, q: AskQuestion) => answerText(d, q) !== '' || q.required === false;
/** The lines the brain reads, and the structured answers behind them. */
export function collect(d: Draft, questions: AskQuestion[]): { text: string; answers: AskAnswer[] } {
  const answers = questions.map((q) => ({ id: q.id, label: q.label, value: answerText(d, q) })).filter((a) => a.value);
  return { text: answers.map((a) => `${a.label} → ${a.value}`).join('\n'), answers };
}

export function renderAskForm(doc: Document, key: string, questions: AskQuestion[], o: { busy?: boolean; onSubmit(text: string, answers: AskAnswer[]): void }): HTMLElement {
  const d = drafts.get(key) ?? { step: 0, values: {}, other: {} };
  drafts.set(key, d);
  const root = h(doc, 'div', { class: 'ask', id: `ask-${key}` });
  const n = questions.length;
  const set = (q: AskQuestion, v: string | string[]) => {
    d.values[q.id] = v;
    paint();
  };
  const submit = () => {
    if (!questions.every((q) => answered(d, q))) return;
    const out = collect(d, questions);
    drafts.delete(key);
    o.onSubmit(out.text, out.answers);
  };
  const next = () => {
    const q = questions[d.step]!;
    if (!answered(d, q)) return;
    if (d.step < n - 1) {
      d.step++;
      paint();
    } else submit();
  };
  const pill = (q: AskQuestion, text: string, on: boolean, onclick: () => void) => h(doc, 'button', { class: 'opt', type: 'button', onclick, attrs: { 'aria-pressed': on ? 'true' : 'false' } }, text);
  const freeBox = (q: AskQuestion, multiline: boolean, value: string, onInput: (v: string) => void, placeholder: string) => {
    const el = multiline ? h(doc, 'textarea', { id: `ask-${key}-${q.id}`, placeholder, attrs: { rows: '3', 'aria-label': q.label } }) : h(doc, 'input', { id: `ask-${key}-${q.id}`, type: 'text', placeholder, autocomplete: 'off', attrs: { 'aria-label': q.label } });
    el.value = value;
    el.addEventListener('input', () => {
      onInput(el.value);
      refreshNav();
    });
    if (!multiline) el.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && next());
    return el;
  };
  let navBtn: HTMLButtonElement | null = null;
  const refreshNav = () => {
    if (navBtn) navBtn.disabled = !!o.busy || !answered(d, questions[d.step]!);
  };
  const control = (q: AskQuestion): Node[] => {
    const v = d.values[q.id];
    const out: Node[] = [];
    if (q.type === 'text' || q.type === 'textarea') out.push(freeBox(q, q.type === 'textarea', (v as string) ?? '', (t) => (d.values[q.id] = t), q.type === 'textarea' ? 'Your answer' : 'Type your answer'));
    else {
      const opts = q.options ?? [];
      const withOther = [...opts, ...(q.other ? [OTHER] : [])];
      if (q.type === 'multi') {
        const picked = Array.isArray(v) ? v : [];
        out.push(h(doc, 'div', { class: 'opts' }, ...withOther.map((opt) => pill(q, opt, picked.includes(opt), () => set(q, picked.includes(opt) ? picked.filter((x) => x !== opt) : [...picked, opt])))));
      } else if (withOther.length <= MAX_PILLS) out.push(h(doc, 'div', { class: 'opts' }, ...withOther.map((opt) => pill(q, opt, v === opt, () => set(q, opt)))));
      else {
        const sel = h(doc, 'select', { id: `ask-${key}-${q.id}`, attrs: { 'aria-label': q.label } });
        sel.append(h(doc, 'option', { text: 'Choose…', attrs: { value: '' } }), ...withOther.map((opt) => h(doc, 'option', { text: opt, attrs: { value: opt } })));
        sel.value = typeof v === 'string' ? v : '';
        sel.addEventListener('change', () => set(q, sel.value));
        out.push(sel);
      }
      if (isOther(d, q)) out.push(freeBox(q, true, d.other[q.id] ?? '', (t) => (d.other[q.id] = t), 'Tell Plato what to answer'));
    }
    return out;
  };
  const paint = () => {
    const q = questions[Math.min(d.step, n - 1)]!;
    const nodes: Node[] = [];
    if (n > 1) nodes.push(h(doc, 'div', { class: 'steps' }, h(doc, 'span', { class: 'num', text: `Question ${d.step + 1} of ${n}` }), h(doc, 'span', { class: 'dots' }, ...questions.map((_, i) => h(doc, 'i', { class: i === d.step ? 'on' : i < d.step ? 'done' : '' })))));
    nodes.push(h(doc, 'p', { class: 'ql', text: q.label }, q.why ? h(doc, 'small', { text: q.why }) : null));
    nodes.push(...control(q));
    navBtn = h(doc, 'button', { class: 'btn primary sm', type: 'button', onclick: next, id: d.step === n - 1 ? `ask-send-${key}` : `ask-next-${key}` }, d.step === n - 1 ? (n > 1 ? 'Answer all' : 'Answer') : 'Next');
    nodes.push(h(doc, 'div', { class: 'nav' }, d.step > 0 ? h(doc, 'button', { class: 'btn ghost sm', type: 'button', onclick: () => ((d.step--), paint()) }, 'Back') : null, navBtn));
    root.replaceChildren(...nodes);
    refreshNav();
  };
  paint();
  return root;
}
