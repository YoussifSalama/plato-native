import { formElement, isVisible } from './inspect';

// The ONLY place in the extension that presses Submit. It runs only when the panel
// asks, after the seeker opted in for this run and the provider is allowed to
// auto-submit. It acts on a registered <form> only, and only when there is exactly one
// visible, enabled submit control: two ("Save draft" and "Submit") or none means
// "ask the person", never a guess. One click per call; retries are the panel's decision.
export type SubmitResult = { clicked: true } | { clicked: false; reason: 'unknown-form' | 'no-submit-control' | 'ambiguous-submit' | 'disabled' };

export function submitForm(doc: Document, formId: string): SubmitResult {
  const form = formElement(doc, formId);
  if (!form) return { clicked: false, reason: 'unknown-form' };
  const controls = Array.from(form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')).filter((el) => el.type === 'submit' && isVisible(el, doc));
  if (!controls.length) return { clicked: false, reason: 'no-submit-control' };
  if (controls.length > 1) return { clicked: false, reason: 'ambiguous-submit' };
  const btn = controls[0]!;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return { clicked: false, reason: 'disabled' };
  btn.click();
  return { clicked: true };
}
