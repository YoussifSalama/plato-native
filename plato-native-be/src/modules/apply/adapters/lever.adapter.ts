import { Injectable } from '@nestjs/common';
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
import { leverApplyUrl, parseLeverForm } from '../forms/lever.form';
import {
  ApplyAdapter,
  BROWSER_UA,
  fillWhenVisible,
  pollFor,
  SubmitOptions,
} from './apply-adapter';
import {
  verificationState,
  waitForHumanVerification,
} from '../human-verification';

import { BrowserInteractionService } from '../interactions/browse-interaction.services';
import { INTERACTION_POLICIES } from '../interactions/interaction.policy';
const SUBMIT = '#btn-submit';
const css = (name: string) => name.replace(/(["\\])/g, '\\$1');

@Injectable()
export class LeverApplyAdapter implements ApplyAdapter {
  readonly source = 'LEVER' as const;

  async loadForm(jobUrl: string): Promise<FormSchema> {
    const applyUrl = leverApplyUrl(jobUrl);
    const res = await fetch(applyUrl, {
      headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
      redirect: 'follow',
    });
    // Closed postings 404, or bounce to the company's board root.
    if (res.status === 404 || !res.url.includes('/apply'))
      throw new JobExpiredError('This Lever posting is no longer open');
    if (!res.ok) throw new Error(`Lever apply page returned ${res.status}`);
    const html = await res.text();
    if (!html.includes('id="application-form"'))
      throw new JobExpiredError(
        'This Lever posting is no longer accepting applications',
      );
    return parseLeverForm(html, applyUrl);
  }

  // Location is an autocomplete (GET /searchLocations) backed by a hidden
  // `selectedLocation`; free text is discarded, a suggestion must be picked.
  // Lever knows "Cairo, EGY", not "Cairo, Egypt", so fall back to the city.
  private async pickLocation(
    ui: BrowserInteractionService,
    page: Page,
    location: string,
  ) {
    const input = page.locator('#location-input');
    for (const query of [location, location.split(',')[0]]) {
      await ui.type(input, query);
      const first = page.locator('.dropdown-location').first();
      // isVisible() does not wait; waitFor() does.
      const shown = await first
        .waitFor({ state: 'visible', timeout: 6000 })
        .then(() => true)
        .catch(() => false);
      if (shown) {
        await ui.click(first);
        return;
      }
    }
    throw new PermanentApplyError(
      `Lever does not recognise the location "${location}"`,
    );
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
    const ui = new BrowserInteractionService(INTERACTION_POLICIES.normal);
    await page.goto(schema.applyUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#application-form', { timeout: 30_000 });

    // Resume first: Lever parses it and prefills fields, which we then
    // overwrite with the confirmed values.
    await ui.upload(page.locator('input[name="resume"]'), resumePath);
    await page.waitForTimeout(4000);

    await fillWhenVisible(schema.fields, async (field) => {
      const value = answers[field.id];
      if (value === undefined || field.type === 'file') return true;
      const byName = `[name="${css(field.id)}"]`;
      const probe =
        field.id === 'location'
          ? page.locator('#location-input')
          : page.locator(byName).first();
      if (!(await probe.isVisible())) return false;

      if (field.type === 'boolean') {
        if (value === true) await ui.check(page.locator(byName));
      } else if (field.type === 'multi' && Array.isArray(value)) {
        for (const v of value)
          await ui.check(page.locator(`${byName}[value="${css(v)}"]`));
      } else if (field.type === 'choice' && typeof value === 'string') {
        const isSelect = (await page.locator(`select${byName}`).count()) > 0;
        if (isSelect)
          await ui.selectOption(page.locator(`select${byName}`), {
            label: value,
          });
        else await ui.check(page.locator(`${byName}[value="${css(value)}"]`));
      } else if (field.id === 'location' && typeof value === 'string') {
        await this.pickLocation(ui, page, value);
      } else if (typeof value === 'string') {
        await ui.fill(page.locator(byName), value);
      }
      return true;
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (dryRun)
      return {
        dryRun: true,
        confirmation: 'Dry run: form filled, not submitted',
        screenshot: screenshotPath,
      };

    // (C) "Submitted" means one thing only: Lever took us to its /thanks
    // confirmation page.
    const thanked = () => /\/thanks/.test(page.url());
    // Lever's answer to the form POST. A 4xx here is Lever REFUSING the
    // application (bad field, or it didn't accept the verification): that
    // must surface as a failure with Lever's own words, not as "still
    // waiting for a human".
    let refusal: { status: number; body: string } | null = null;
    page.on('response', (r) => {
      if (r.request().method() !== 'POST' || !/\/apply(\?|$)/.test(r.url()))
        return;
      if (r.status() < 400) return;
      void r
        .text()
        .catch(() => '')
        .then((body) => {
          refusal = {
            status: r.status(),
            body: body
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 400),
          };
        });
    });
    await ui.click(page.locator(SUBMIT));

    type Outcome =
      | { kind: 'submitted' }
      | { kind: 'human'; indicators: string[] }
      | { kind: 'rejected'; message: string };
    const settle = (ms: number) =>
      pollFor<Outcome>(async () => {
        if (thanked()) return { kind: 'submitted' };
        if (refusal)
          return {
            kind: 'rejected',
            message: `Lever refused the application (HTTP ${refusal.status})${refusal.body ? `: ${refusal.body}` : ''}`,
          };
        const state = await verificationState(page, SUBMIT);
        if (state.blocked)
          return { kind: 'human', indicators: state.indicators };
        const error = await page
          .locator('.error-message:visible, .application-error:visible')
          .first()
          .textContent({ timeout: 500 })
          .catch(() => null);
        return error?.trim()
          ? { kind: 'rejected', message: error.trim() }
          : null;
      }, ms);

    let outcome = await settle(45_000);

    if (outcome?.kind === 'human') {
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined);
      const asked = `Lever asked for human verification (${outcome.indicators[0] ?? 'challenge shown'})`;
      // Plato never solves or sidesteps this.
      if (!headed || !onHumanCheck)
        throw new HumanNeededError(asked, outcome.indicators);
      await onHumanCheck(outcome.indicators);
      const waited = await waitForHumanVerification(page, {
        submitSelector: SUBMIT,
        isSubmitted: thanked,
        timeoutMs: verificationWaitMs,
      });
      if (waited === 'timeout')
        throw new HumanNeededError(asked, outcome.indicators, true);
      await onVerificationCompleted?.();
      // Lever's own callback submits once the check passes; give it time.
      outcome = await settle(60_000);
    }

    if (!outcome)
      throw new Error('Lever did not confirm the submission in time');
    if (outcome.kind === 'submitted') {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        dryRun: false,
        confirmation: 'Lever confirmation page reached',
        screenshot: screenshotPath,
      };
    }
    if (outcome.kind === 'human')
      // Asked again right after a completed check: not a timeout.
      throw new HumanNeededError(
        'Lever asked for human verification again after the first one was completed',
        outcome.indicators,
      );
    throw new SiteRejectedError(outcome.message, [outcome.message]);
  }
}
