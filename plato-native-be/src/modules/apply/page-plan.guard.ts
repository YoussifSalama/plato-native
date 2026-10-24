// Pure checks on whatever the page planner (an LLM) answered. The model is never trusted to stay
// inside its rules: a control it names must exist, and a submit needs permission and no empty field.
export interface Plan {
  action: 'press' | 'wait' | 'ask' | 'skip' | 'done';
  ref: string | null;
  intent: 'open_apply' | 'next' | 'review' | 'submit' | 'other' | null;
  reason: string;
  skip_reason: 'closed' | 'already_applied' | 'not_a_job' | null;
}
export interface PlanInput {
  snapshot: {
    url: string;
    title: string;
    dialogOpen: boolean;
    dialogTitle: string;
    elements: { ref: string; role: string; label: string }[];
    fields: { total: number; empty: number };
    alerts: string[];
    text: string;
  };
  history: { action: string; intent: string | null; label: string }[];
  autoSubmit: boolean;
}

const ask = (reason: string, intent: Plan['intent'] = null): Plan => ({ action: 'ask', ref: null, intent, reason, skip_reason: null });

export function guardPlan(plan: Plan, input: PlanInput): Plan {
  if (plan.action === 'press') {
    if (!plan.ref || !input.snapshot.elements.some((e) => e.ref === plan.ref)) return ask('The control I wanted is not on the page.');
    if (plan.intent === 'submit' && !input.autoSubmit) return ask('Ready for you to submit.', 'submit');
    if (plan.intent === 'submit' && input.snapshot.fields.empty > 0) return ask('Some fields are still empty.', 'submit');
    // the same press already happened and nothing changed: never loop on it
    const label = input.snapshot.elements.find((e) => e.ref === plan.ref)!.label;
    if (input.history.filter((h) => h.action === 'press' && h.label === label).length >= 2) return ask(`Pressing “${label}” did not move the page.`);
  }
  if (plan.action === 'skip' && !plan.skip_reason) return ask(plan.reason || 'Nothing to apply to here.');
  return plan;
}
