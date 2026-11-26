// The check before Submit: every field Plato filled, its value and where the value came from, as the backend verified
// it. Guessed and unverified answers come first, in amber, with why; sensitive ones are marked. Values are editable in
// place: "Fix these" sends the changed ones for Plato to put on the form (it then lists again), "Looks right, submit"
// is the seeker's go-ahead. Paints itself in place and keeps a draft per job, like ask-form.ts. Pure DOM, no innerHTML.
import type { Review, ReviewField } from '../v3/contract';
import { icon } from './icons';
import { h } from './view';

export const SOURCE: Record<ReviewField['source'], string> = { cv: 'From your CV', answer: 'Saved answer', profile: 'Profile', job: 'From the job', rule: 'Plato’s rule', guess: 'Guessed' };
const CATEGORY: Record<NonNullable<ReviewField['category']>, string> = { pay: 'Pay', work_auth: 'Work permit', sponsorship: 'Visa', legal: 'Legal', demographic: 'Personal' };
const why = (f: ReviewField) => (f.status === 'guess' ? 'Plato guessed this. Nothing in your CV, answers or profile says it.' : f.status === 'unverified' ? `Plato said “${SOURCE[f.source]}”, but the value is not there.` : '');

const drafts = new Map<string, Record<number, string>>(); // item id -> field index -> the seeker's value
export const clearReviewDraft = (key: string) => void drafts.delete(key);

export function renderReviewCard(doc: Document, key: string, review: Review, o: { busy?: boolean; onFix(changes: { label: string; value: string }[]): void; onSubmit(): void; onOpen(): void }): HTMLElement {
  const d = drafts.get(key) ?? {};
  drafts.set(key, d);
  // attention first (guessed, then unverified), then sensitive; the page's order otherwise
  const rank = (f: ReviewField) => (f.status === 'guess' ? 0 : f.status === 'unverified' ? 1 : f.sensitive ? 2 : 3);
  const rows = review.fields.map((f, i) => ({ f, i })).sort((x, y) => rank(x.f) - rank(y.f) || x.i - y.i);
  const look = rows.filter((r) => r.f.status !== 'ok').length;
  const changes = () => rows.filter((r) => d[r.i] !== undefined && d[r.i]!.trim() !== r.f.value).map((r) => ({ label: r.f.label, value: d[r.i]!.trim() }));
  const root = h(doc, 'div', { class: 'qcard review', id: `review-${key}` });
  const fixBtn = h(doc, 'button', { class: 'btn sm', type: 'button', id: `review-fix-${key}`, onclick: () => {
    const c = changes();
    if (!c.length) return;
    drafts.delete(key);
    o.onFix(c);
  } }, 'Fix these');
  const okBtn = h(doc, 'button', { class: 'btn primary sm', type: 'button', id: `review-ok-${key}`, onclick: () => {
    if (changes().length) return;
    drafts.delete(key);
    o.onSubmit();
  } }, review.complete ? 'Looks right, submit' : 'I checked the tab, submit');
  const hint = h(doc, 'p', { class: 'rv-hint' });
  const paint = () => {
    const n = changes().length;
    fixBtn.textContent = n ? `Fix ${n === 1 ? 'this' : `these ${n}`}` : 'Fix these';
    fixBtn.className = n ? 'btn primary sm' : 'btn sm';
    fixBtn.disabled = !!o.busy || !n;
    okBtn.className = n ? 'btn sm' : 'btn primary sm';
    okBtn.disabled = !!o.busy || !!n;
    hint.textContent = n ? 'Plato puts your changes on the form, then shows the list again before Submit.' : '';
  };
  const title = !review.complete ? 'Plato could not list what it filled' : look ? `Check ${look} answer${look === 1 ? '' : 's'} before Plato submits` : 'Check the answers before Plato submits';
  const sub = !review.complete ? 'Look over the form in the job’s tab before you submit. Nothing is sent until you say so.'
    : review.holdReason === 'sensitive' ? 'You chose Apply for me, but a sensitive answer is not backed by your profile, so Plato stopped here.'
    : 'Nothing is sent until you say so. Change any value and Plato fixes the form.';
  root.append(h(doc, 'p', { class: 'qt', text: title }), h(doc, 'p', { class: 'rv-sub', text: sub }));
  if (rows.length) {
    const list = h(doc, 'ul', { class: 'rv-list' });
    for (const { f, i } of rows) {
      const id = `rv-${key}-${i}`;
      const value = d[i] ?? f.value;
      const long = f.value.length > 60 || f.value.includes('\n');
      const box = long ? h(doc, 'textarea', { id, attrs: { rows: '3', 'aria-label': f.label } }) : h(doc, 'input', { id, type: 'text', autocomplete: 'off', attrs: { 'aria-label': f.label } });
      box.value = value;
      box.addEventListener('input', () => {
        d[i] = box.value;
        li.classList.toggle('edited', box.value.trim() !== f.value);
        paint();
      });
      const warn = f.status !== 'ok';
      const li = h(doc, 'li', { class: `rv${warn ? ' warn' : ''}${value.trim() !== f.value ? ' edited' : ''}` },
        h(doc, 'div', { class: 'rv-hd' }, h(doc, 'label', { text: f.label, attrs: { for: id } }),
          f.sensitive ? h(doc, 'span', { class: 'rv-sens', attrs: { title: 'Sensitive: Plato never submits it unchecked' } }, icon(doc, 'alert'), f.category ? CATEGORY[f.category] : 'Sensitive') : null,
          h(doc, 'span', { class: `rv-src ${f.status}`, text: f.status === 'unverified' ? `${SOURCE[f.source]} · not verified` : SOURCE[f.source] })),
        box,
        warn ? h(doc, 'small', { class: 'rv-why', text: why(f) }) : f.evidence ? h(doc, 'small', { class: 'rv-ev', text: f.evidence.slice(0, 160) }) : null);
      list.append(li);
    }
    root.append(list);
    // the gate refuses Back/Continue once armed (CONTRACT: gate limit): Plato can only change this page
    root.append(h(doc, 'p', { class: 'rv-hint', id: `review-pages-${key}`, text: 'Plato can change only the fields on the page the form is on now. To change an answer on an earlier page, open the tab and fix it there by hand.' }));
  }
  root.append(hint, h(doc, 'div', { class: 'chips' }, okBtn, fixBtn, h(doc, 'button', { class: 'btn sm', type: 'button', onclick: o.onOpen, disabled: o.busy }, icon(doc, 'ext'), 'Open the tab')));
  paint();
  return root;
}
