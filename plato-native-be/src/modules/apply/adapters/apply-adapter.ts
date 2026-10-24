import type { Page } from 'playwright-core';
import { Answers, ApplySource, FormSchema, SubmitResult } from '../apply.types';

export interface SubmitOptions {
  resumePath: string;
  // A visible browser on someone's desk: a person can pass a human check.
  // Headless has nobody to click it, so it must give up at once.
  headed: boolean;
  // How long to keep the window open for that person.
  verificationWaitMs: number;
  // Lifecycle of a human check, so the worker can set the status and log.
  // The adapter keeps the SAME page open throughout: nothing is refilled.
  onHumanCheck?: (indicators: string[]) => Promise<void>;
  onVerificationCompleted?: () => Promise<void>;
  // Fill everything, screenshot, stop before the submit click.
  dryRun: boolean;
  screenshotPath: string;
}

// One per ATS. `loadForm` is plain HTTP (cheap, no browser) and doubles as
// the "is this posting still open?" pre-flight. `submit` is the only part
// that needs a real browser.
export interface ApplyAdapter {
  readonly source: ApplySource;
  // Throws JobExpiredError when the posting is closed.
  loadForm(jobUrl: string): Promise<FormSchema>;
  submit(
    page: Page,
    schema: FormSchema,
    answers: Answers,
    options: SubmitOptions,
  ): Promise<SubmitResult>;
}

export const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Poll `check` until it returns a value or the deadline passes.
export async function pollFor<T>(
  check: () => Promise<T | null>,
  timeoutMs: number,
  everyMs = 1000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value !== null) return value;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return null;
}

// Walk fields in order. A field whose target is not visible yet (conditional
// question, section revealed by an earlier answer) is deferred, not forced:
// `fillOne` returns false for "not there yet", and it is retried on later
// passes. Whatever never appears is skipped; the site's own validation
// reports it if it was required.
export async function fillWhenVisible(
  fields: FormSchema['fields'],
  fillOne: (field: FormSchema['fields'][number]) => Promise<boolean>,
  passes = 3,
  settleMs = 700,
): Promise<void> {
  let pending = fields;
  for (let pass = 0; pass < passes && pending.length; pass++) {
    if (pass) await new Promise((r) => setTimeout(r, settleMs));
    const next: typeof pending = [];
    for (const field of pending) if (!(await fillOne(field))) next.push(field);
    pending = next;
  }
}
