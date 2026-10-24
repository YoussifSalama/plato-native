import { Injectable } from '@nestjs/common';
import { openBrowser } from '../open-browser';
import type { Page } from 'playwright-core';
import {
  Answers,
  FormSchema,
  HumanNeededError,
  JobExpiredError,
  PermanentApplyError,
  SiteRejectedError,
  SubmitResult,
} from '../apply.types';
import {
  AshbyApplicationForm,
  ashbyIds,
  ashbyApplyUrl,
  normalizeAshbyForm,
} from '../forms/ashby.form';
import {
  ApplyAdapter,
  fillWhenVisible,
  pollFor,
  SubmitOptions,
} from './apply-adapter';
import { verificationState } from '../human-verification';

import { BrowserInteractionService } from '../interactions/browse-interaction.services';
import { INTERACTION_POLICIES } from '../interactions/interaction.policy';
const SUBMIT = 'button.ashby-application-form-submit-button';
// Best-effort: Ashby is a client app, so "submitted" is also read from the
// submit button disappearing (the view swaps on success). Verify this
// wording against a real successful submission the first time this runs live.
const THANKS =
  /thank you for applying|application (has been )?(received|submitted)|we('| ha)ve received your application/i;
// Ashby's anti-bot verdict: replaces the form with this page (seen live).
const FLAGGED = /couldn't submit your application|flagged as possible spam/i;
const field = (id: string) =>
  `[data-field-path="${id.replace(/(["\\])/g, '\\$1')}"]`;

@Injectable()
export class AshbyApplyAdapter implements ApplyAdapter {
  readonly source = 'ASHBY' as const;

  // Ashby's application form isn't plain-HTTP fetchable (it loads via a
  // GraphQL call the page itself makes after rendering): open a throwaway
  // page and capture that response instead of a JSON fetch, unlike the
  // other three adapters. See forms/ashby.form.ts.
  async loadForm(jobUrl: string): Promise<FormSchema> {
    const ids = ashbyIds(jobUrl);
    if (!ids)
      throw new PermanentApplyError('Not a jobs.ashbyhq.com posting URL');
    const applyUrl = ashbyApplyUrl(ids.board, ids.id);

    const browser = await openBrowser({ headless: true }, { plain: true });
    try {
      const page = await browser.newPage();
      const posting = page
        .waitForResponse(
          (res) =>
            res.url().includes('non-user-graphql') &&
            res.url().includes('ApiJobPosting'),
          { timeout: 20_000 },
        )
        .then((res) => res.json())
        .catch(() => null);
      const response = await page.goto(applyUrl, {
        waitUntil: 'domcontentloaded',
      });
      if (response && [404, 410].includes(response.status()))
        throw new JobExpiredError('This Ashby posting is closed');
      const body = (await posting) as {
        data?: { jobPosting?: { applicationForm?: AshbyApplicationForm } };
      } | null;
      const form = body?.data?.jobPosting?.applicationForm;
      if (!form)
        throw new JobExpiredError(
          'This Ashby posting is no longer accepting applications',
        );
      return normalizeAshbyForm(form, applyUrl);
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  // Location is an autocomplete backed by a debounced geocode search that
  // only fires on real keystrokes: .fill() sets the value without them and
  // leaves the field empty (confirmed live — the dropdown never opens).
  private async pickLocation(
    ui: BrowserInteractionService,
    page: Page,
    location: string,
  ) {
    const input = page.locator(`${field('_systemfield_location')} input`);
    await ui.type(input, location);
    const first = page.locator('[role="listbox"] [role="option"]').first();
    const shown = await first
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (shown) await ui.click(first);
  }

  async submit(
    page: Page,
    schema: FormSchema,
    answers: Answers,
    {
      resumePath,
      dryRun,
      screenshotPath,
      headed,
      verificationWaitMs,
      onHumanCheck,
      onVerificationCompleted,
    }: SubmitOptions,
  ): Promise<SubmitResult> {
    // Humanized pacing on for Ashby regardless of APPLY_HUMANIZE.
    const ui = new BrowserInteractionService(INTERACTION_POLICIES.normal, true);
    const response = await page.goto(schema.applyUrl, {
      waitUntil: 'domcontentloaded',
    });
    if (response && [404, 410].includes(response.status()))
      throw new JobExpiredError('This Ashby posting is closed');
    await page.waitForSelector(field('_systemfield_name'), { timeout: 30_000 });

    await ui.upload(
      page.locator(`${field('_systemfield_resume')} input[type="file"]`),
      resumePath,
    );

    await fillWhenVisible(schema.fields, async (f) => {
      const value = answers[f.id];
      if (value === undefined || f.type === 'file') return true;
      const scope = page.locator(field(f.id));
      if (!(await scope.first().isVisible())) return false;

      if (f.type === 'boolean') {
        if (value === true)
          await ui.click(scope.locator('button[data-option="yes"]'));
        else if (value === false)
          await ui.click(scope.locator('button[data-option="no"]'));
        return true;
      }
      if (f.id === '_systemfield_location' && typeof value === 'string') {
        await this.pickLocation(ui, page, value);
        return true;
      }
      if (f.type === 'choice' && typeof value === 'string') {
        await ui.click(
          scope
            .locator('label')
            .filter({
              hasText: new RegExp(
                `^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
                'i',
              ),
            })
            .first(),
        );
        return true;
      }
      if (f.type === 'multi' && Array.isArray(value)) {
        for (const v of value)
          await ui.click(
            scope
              .locator('label')
              .filter({
                hasText: new RegExp(
                  `^\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
                  'i',
                ),
              })
              .first(),
          );
        return true;
      }
      if (typeof value === 'string')
        await ui.fill(scope.locator('input, textarea'), value);
      return true;
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (dryRun)
      return {
        dryRun: true,
        confirmation: 'Dry run: form filled, not submitted',
        screenshot: screenshotPath,
      };

    let refusal: { status: number; body: string } | null = null;
    page.on('response', (r) => {
      if (r.request().method() !== 'POST' || !/non-user-graphql/.test(r.url()))
        return;
      if (r.status() < 400) return;
      void r
        .text()
        .catch(() => '')
        .then((body) => {
          refusal = { status: r.status(), body: body.slice(0, 400) };
        });
    });
    // Ashby does not accept an automated Submit: seen live, the click either
    // does nothing or the form is swapped for a "flagged as possible spam"
    // page. Plato fills the form; a person presses Submit in the open window.
    // ponytail: no workaround on purpose — never sidestep the site's check.
    if (!headed || !onHumanCheck)
      throw new HumanNeededError('Ashby needs a person to press Submit', [
        'Ashby does not accept automated submissions',
      ]);
    await onHumanCheck(['Press "Submit Application" in the window']);

    type Outcome =
      | { kind: 'submitted' }
      | { kind: 'human'; indicators: string[] }
      | { kind: 'rejected'; message: string };
    const pageText = () =>
      page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    // The spam-flag page also removes the Submit button, so "button gone"
    // alone must never count as submitted.
    // Each company writes its own success message (often not English);
    // Ashby ships it in the page's app data.
    const custom = await page
      .evaluate(
        () =>
          (
            window as unknown as {
              __appData?: {
                organization?: {
                  theme?: { applicationSubmittedSuccessMessage?: string };
                };
              };
            }
          ).__appData?.organization?.theme
            ?.applicationSubmittedSuccessMessage ?? '',
      )
      .catch(() => '');
    const thanked = async () => {
      const text = await pageText();
      return (
        THANKS.test(text) ||
        (custom.trim().length > 8 && text.includes(custom.trim())) ||
        ((await page.locator(SUBMIT).count()) === 0 && !FLAGGED.test(text))
      );
    };
    const settle = (ms: number) =>
      pollFor<Outcome>(async () => {
        if (FLAGGED.test(await pageText()))
          return {
            kind: 'human',
            indicators: ['Ashby flagged the submission as possible spam'],
          };
        if (await thanked()) return { kind: 'submitted' };
        if (refusal)
          return {
            kind: 'rejected',
            message: `Ashby refused the application (HTTP ${refusal.status})${refusal.body ? `: ${refusal.body}` : ''}`,
          };
        const state = await verificationState(page, SUBMIT);
        if (state.blocked)
          return { kind: 'human', indicators: state.indicators };
        // Ashby keeps the form on screen and shows validation errors (or its
        // spam-flag banner) instead of failing the request, so without this
        // the run just waits out the timeout.
        const errors = await page
          .locator('[class*="error" i]:visible, [role="alert"]:visible')
          .allTextContents()
          .catch((): string[] => []);
        const shown = errors.map((e) => e.trim()).filter(Boolean);
        return shown.length
          ? {
              kind: 'rejected',
              message: `Ashby's form would not submit: ${shown.slice(0, 5).join('; ')}`,
            }
          : null;
      }, ms);

    // Waits for the person to press Submit and for Ashby to answer.
    let outcome = await settle(verificationWaitMs);
    // A disabled Submit means the request is still in flight; closing now
    // abandons it.
    // ponytail: one extra fixed wait, no retry/poll of the network itself.
    if (
      !outcome &&
      (await page
        .locator(SUBMIT)
        .isDisabled()
        .catch(() => false))
    )
      outcome = await settle(90_000);
    if (!outcome) {
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined);
      throw new HumanNeededError('Ashby was not submitted', [], true);
    }
    if (outcome.kind === 'human')
      throw new HumanNeededError(
        'Ashby flagged the submission as possible spam. Wait a little, then press Continue to reopen the form and submit it again yourself',
        outcome.indicators,
      );
    await onVerificationCompleted?.();

    if (outcome.kind === 'submitted') {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        dryRun: false,
        confirmation: 'Ashby confirmation reached',
        screenshot: screenshotPath,
      };
    }
    throw new SiteRejectedError(outcome.message, [outcome.message]);
  }
}
