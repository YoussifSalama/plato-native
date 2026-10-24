import { finishDecision, snapOption, type DecideField, type RawDecision } from './page-decide.agent';
import type { PlanInput } from './page-plan.guard';

const page: PlanInput = {
  snapshot: { url: 'https://x.test/apply', title: 'Apply', dialogOpen: false, dialogTitle: '', elements: [{ ref: 'e1', role: 'button', label: 'Next' }, { ref: 'e2', role: 'button', label: 'Submit application' }], fields: { total: 3, empty: 3 }, alerts: [], text: '' },
  history: [],
  autoSubmit: true,
};
const fields: DecideField[] = [
  { id: 'f1', label: 'First Name', type: 'text', required: true },
  { id: 'f2', label: 'Years of experience', type: 'number', required: true },
  { id: 'f3', label: 'Country', type: 'choice', required: false, options: ['Egypt', 'Peru'] },
];
const raw = (o: Partial<RawDecision> = {}): RawDecision => ({
  page_type: 'application_form',
  fills: [],
  missing: [],
  next: { action: 'press', ref: 'e1', intent: 'next', reason: 'continue', skip_reason: null },
  ask_seeker: null,
  ...o,
});

describe('finishDecision', () => {
  it('drops values that do not fit the field, keeps the rest', () => {
    const d = finishDecision(raw({ fills: [{ id: 'f1', value: 'Youssif', grounded: true }, { id: 'f2', value: 'three to five', grounded: true }, { id: 'f3', value: 'Mars', grounded: true }] }), fields, page);
    expect(d.fills).toEqual([{ id: 'f1', value: 'Youssif' }]);
  });

  it('never keeps an ungrounded value', () => {
    expect(finishDecision(raw({ fills: [{ id: 'f1', value: 'Guess', grounded: false }] }), fields, page).fills).toEqual([]);
  });

  it('an ungrounded CHOICE is kept when every part is a real option and the question is not a fact about the seeker', () => {
    const f: DecideField[] = [
      { id: 'loc', label: 'Which location are you applying for?', type: 'choice', required: true, options: ['Bogota', 'Lima'] },
      { id: 'hrs', label: 'Are you able to work during our core hours?', type: 'choice', required: true, options: ['Yes', 'No'] },
    ];
    const d = finishDecision(raw({ fills: [{ id: 'loc', value: 'Lima', grounded: false }, { id: 'hrs', value: 'yes', grounded: false }] }), f, page);
    expect(d.fills).toEqual([{ id: 'loc', value: 'Lima' }, { id: 'hrs', value: 'Yes' }]);
    expect(d.missing).toEqual([]);
  });

  it('an ungrounded choice about a FACT (work authorization, consent, background) is dropped: the seeker decides', () => {
    const f: DecideField[] = [
      { id: 'auth', label: 'Are you legally authorized to work in the United States?', type: 'choice', required: true, options: ['Yes', 'No'] },
      { id: 'bg', label: 'Is there anything in your background that would prevent you from passing a background check?', type: 'choice', required: true, options: ['Yes', 'No'] },
    ];
    const d = finishDecision(raw({ fills: [{ id: 'auth', value: 'Yes', grounded: false }, { id: 'bg', value: 'No', grounded: false }] }), f, page);
    expect(d.fills).toEqual([]);
    expect(d.missing.map((m) => m.field_id)).toEqual(['auth', 'bg']);
  });

  it('an ungrounded choice that is not one of the options is still dropped', () => {
    const d = finishDecision(raw({ fills: [{ id: 'f3', value: 'Mars', grounded: false }] }), fields, page);
    expect(d.fills).toEqual([]);
  });

  it('a profile rule fills what the model left empty BEFORE missing and the move are computed', () => {
    const f: DecideField[] = [{ id: 'f1', label: 'First Name', type: 'text', required: true }, { id: 'd', label: 'When Are You Available To Start? (mm/dd/yyyy)', type: 'text', required: true }];
    const submit = { action: 'press' as const, ref: 'e2', intent: 'submit' as const, reason: 'done', skip_reason: null };
    const d = finishDecision(raw({ fills: [{ id: 'f1', value: 'Y', grounded: true }], missing: [{ field_id: 'd', reason: 'no date' }], next: submit }), f, page, (q) => (q.id === 'd' ? '11/01/2026' : null));
    expect(d.fills).toEqual([{ id: 'f1', value: 'Y' }, { id: 'd', value: '11/01/2026' }]);
    expect(d.missing).toEqual([]);
    expect(d.next).toMatchObject({ action: 'press', intent: 'submit' });
  });

  it('lists every required field without a value as missing, with the model reason when it gave one', () => {
    const d = finishDecision(raw({ fills: [{ id: 'f1', value: 'Youssif', grounded: true }], missing: [{ field_id: 'f2', reason: 'no work history' }, { field_id: 'zz', reason: 'made up' }] }), fields, page);
    expect(d.missing).toEqual([{ field_id: 'f2', reason: 'no work history' }]);
  });

  it('a required gap blocks Next / Submit (the guard re-checks the move)', () => {
    const d = finishDecision(raw({ next: { action: 'press', ref: 'e2', intent: 'submit', reason: 'done', skip_reason: null } }), fields, page);
    expect(d.next.action).toBe('ask');
  });

  it('a seeker question always stops the run', () => {
    const d = finishDecision(raw({ fills: [{ id: 'f1', value: 'Y', grounded: true }, { id: 'f2', value: '3', grounded: true }], ask_seeker: { question: 'Apply anyway?', choices: ['Apply anyway', 'Skip this job'] } }), fields, page);
    expect(d.next).toMatchObject({ action: 'ask', reason: 'Apply anyway?' });
  });

  it('a control the page does not have becomes ask', () => {
    const d = finishDecision(raw({ fills: [{ id: 'f1', value: 'Y', grounded: true }, { id: 'f2', value: '3', grounded: true }], next: { action: 'press', ref: 'e99', intent: 'next', reason: 'x', skip_reason: null } }), fields, page);
    expect(d.next.action).toBe('ask');
  });

  it('all required filled: the move goes through', () => {
    const d = finishDecision(raw({ fills: [{ id: 'f1', value: 'Y', grounded: true }, { id: 'f2', value: '3', grounded: true }] }), fields, page);
    expect(d.next).toMatchObject({ action: 'press', ref: 'e1', intent: 'next' });
    expect(d.missing).toEqual([]);
  });
});

describe('snapOption: an answer becomes the option it means', () => {
  const opts = [
    'A. I have owned and shipped backend services used in production, including design and operational responsibility',
    'B. I have contributed significantly to production backend systems but did not own them end-to-end',
    'C. I have trained or experimented with models, but not deployed to production',
    'D. I do not have production backend experience',
  ];
  it('exact, by letter, by containment, by shared words; never an invented value', () => {
    expect(snapOption(opts, opts[1]!)).toBe(opts[1]);
    expect(snapOption(opts, 'A')).toBe(opts[0]);
    expect(snapOption(opts, 'c.')).toBe(opts[2]);
    expect(snapOption(opts, 'I have contributed significantly to production backend systems')).toBe(opts[1]);
    // a paraphrase is never guessed by shared words (that once turned "backend experience" into option D, "I do NOT have…")
    expect(snapOption(opts, 'I have production backend experience')).toBeUndefined();
    expect(snapOption(opts, 'I like turtles')).toBeUndefined();
    expect(snapOption(['Yes', 'No'], 'yes')).toBe('Yes');
  });
});
