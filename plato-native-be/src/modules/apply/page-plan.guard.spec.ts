import { guardPlan, Plan, PlanInput } from './page-plan.guard';

const input = (over: Partial<PlanInput['snapshot']> = {}, extra: Partial<PlanInput> = {}): PlanInput => ({
  snapshot: { url: 'https://x', title: 't', dialogOpen: true, dialogTitle: 'd', elements: [{ ref: 'e1', role: 'button', label: 'Next' }, { ref: 'e2', role: 'button', label: 'Submit application' }], fields: { total: 2, empty: 0 }, alerts: [], text: '', ...over },
  history: [], autoSubmit: true, ...extra,
});
const press = (ref: string | null, intent: Plan['intent']): Plan => ({ action: 'press', ref, intent, reason: 'r', skip_reason: null });

describe('guardPlan', () => {
  it('lets a real control through', () => {
    expect(guardPlan(press('e1', 'next'), input())).toMatchObject({ action: 'press', ref: 'e1' });
  });
  it('rejects a control that is not on the page', () => {
    expect(guardPlan(press('e9', 'next'), input()).action).toBe('ask');
    expect(guardPlan(press(null, 'next'), input()).action).toBe('ask');
  });
  it('never submits without permission or with empty fields', () => {
    expect(guardPlan(press('e2', 'submit'), input({}, { autoSubmit: false })).action).toBe('ask');
    expect(guardPlan(press('e2', 'submit'), input({ fields: { total: 3, empty: 1 } })).action).toBe('ask');
    expect(guardPlan(press('e2', 'submit'), input())).toMatchObject({ action: 'press' });
  });
  it('does not loop on a press that already did nothing twice', () => {
    const h = { action: 'press', intent: 'next', label: 'Next' };
    expect(guardPlan(press('e1', 'next'), input({}, { history: [h, h] })).action).toBe('ask');
  });
  it('a skip needs a reason', () => {
    expect(guardPlan({ action: 'skip', ref: null, intent: null, reason: 'x', skip_reason: null }, input()).action).toBe('ask');
  });
});
