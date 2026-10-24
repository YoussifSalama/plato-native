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
import {
  normalizeWorkableForm,
  WORKABLE_ORIGIN,
  workableJobId,
} from '../forms/workable.form';
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
import { AdapterHelper } from './helpers/adapters.helper';

import { BrowserInteractionService } from '../interactions/browse-interaction.services';
import { INTERACTION_POLICIES } from '../interactions/interaction.policy';
const SUBMIT = '[data-ui="apply-button"]';
const JSON_HEADERS = { accept: 'application/json', 'user-agent': BROWSER_UA };

@Injectable()
export class WorkableApplyAdapter implements ApplyAdapter {
  constructor(private readonly adapterHelper: AdapterHelper) {}
  readonly source = 'WORKABLE' as const;

  async loadForm(jobUrl: string): Promise<FormSchema> {
    const id = workableJobId(jobUrl);
    if (!id)
      throw new PermanentApplyError('Not a jobs.workable.com posting URL');

    // The form endpoint keeps answering for closed jobs; the job endpoint
    // is the source of truth for "still open".
    const jobRes = await fetch(`${WORKABLE_ORIGIN}/api/v1/jobs/${id}`, {
      headers: JSON_HEADERS,
    });
    if (jobRes.status === 404 || jobRes.status === 410)
      throw new JobExpiredError('This Workable posting is closed');
    if (!jobRes.ok)
      throw new Error(`Workable job API returned ${jobRes.status}`);
    const job = (await jobRes.json()) as {
      state?: string;
      linkoutUrl?: string | null;
    };
    if (job.state && job.state !== 'published')
      throw new JobExpiredError(`This Workable posting is ${job.state}`);
    if (job.linkoutUrl)
      throw new PermanentApplyError(
        `This employer takes applications on its own site: ${job.linkoutUrl}`,
        'unsupported',
      );

    const formRes = await fetch(`${WORKABLE_ORIGIN}/api/v1/jobs/${id}/form`, {
      headers: JSON_HEADERS,
    });
    if (!formRes.ok)
      throw new Error(`Workable form API returned ${formRes.status}`);
    return normalizeWorkableForm(
      (await formRes.json()) as Parameters<typeof normalizeWorkableForm>[0],
      jobUrl,
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
    const response = await page.goto(schema.applyUrl, {
      waitUntil: 'domcontentloaded',
    });
    if (response && [404, 410].includes(response.status()))
      throw new JobExpiredError('This Workable posting is closed');

    await ui
      .click(page.locator('[data-ui="cookie-consent-accept"]'), {
        timeout: 5000,
      })
      .catch(() => undefined);
    await ui.click(page.locator('[data-ui="overview-apply-now"]'), {
      timeout: 20_000,
    });
    await page.waitForSelector('[data-ui="firstname"]', { timeout: 30_000 });

    await fillWhenVisible(schema.fields, async (field) => {
      const value = answers[field.id];
      if (
        value === undefined ||
        field.type === 'file' ||
        field.type === 'group'
      )
        return true;
      const el = `[data-ui="${field.id}"]`;
      if (!(await page.locator(el).first().isVisible())) return false;

      if (field.type === 'boolean') {
        // <fieldset role=radiogroup>: the native radios (value "true"/"false")
        // are hidden behind custom role=radio controls, YES first, NO second.
        const wanted = page.locator(
          `${el} [role="radio"]:has(input[value="${String(value)}"])`,
        );
        const target = (await wanted.count())
          ? wanted.first()
          : page.locator(`${el} [role="radio"]`).nth(value ? 0 : 1);
        await ui.click(target);
      } else if (field.type === 'phone' && typeof value === 'string') {
        // intl-tel-input lazy-loads its validator on real keyboard input;
        // fill() skips that and submit then crashes on `isValidNumber`.
        // Typing the +country number also selects the right flag.
        const tel = page.locator(`${el} input[type="tel"]`);
        await ui.type(tel, value);
        await page
          .waitForFunction(
            () =>
              typeof (window as unknown as { intlTelInputUtils?: unknown })
                .intlTelInputUtils !== 'undefined',
            undefined,
            { timeout: 15_000 },
          )
          .catch(() => undefined);
      } else if (
        (field.type === 'choice' || field.type === 'multi') &&
        (typeof value === 'string' || Array.isArray(value))
      ) {
        for (const option of Array.isArray(value) ? value : [value]) {
          const inField = page
            .locator(el)
            .getByText(option, { exact: true })
            .first();
          if (!(await inField.isVisible())) {
            // Dropdown: the options only exist once it is opened, and the
            // list may render outside the field (portal).
            await ui.click(
              page
                .locator(el)
                .locator(
                  '[role="combobox"], button, input:not([type="hidden"])',
                )
                .first(),
            );
            await ui.click(
              page
                .locator('[role="option"], [role="listbox"] *')
                .getByText(option, { exact: true })
                .or(inField)
                .first(),
            );
          } else await ui.click(inField);
        }
      } else if (typeof value === 'string') {
        await ui.fill(
          page.locator(el),
          value.slice(0, field.maxLength ?? value.length),
        );
      }
      return true;
    });

    await ui.upload(page.locator('input[data-ui="resume"]'), resumePath);
    // The upload is a separate presigned request; give it time to settle.
    await page
      .waitForLoadState('networkidle', { timeout: 30_000 })
      .catch(() => undefined);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (dryRun)
      return {
        dryRun: true,
        confirmation: 'Dry run: form filled, not submitted',
        screenshot: screenshotPath,
      };

    // (C) "Submitted" means one thing only: Workable answered our POST
    // /apply with a 2xx. A filled form, a click, a vanished drawer: none of
    // those count.
    const isApply = (url: string) => /\/api\/v1\/jobs\/[^/]+\/apply/.test(url);
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && isApply(r.url())) posted = true;
    });
    const applyResponse = page.waitForResponse(
      (r) => r.request().method() === 'POST' && isApply(r.url()),
      { timeout: verificationWaitMs + 120_000 },
    );
    applyResponse.catch(() => undefined);
    await ui.click(page.locator(SUBMIT));

    // (B) Whichever comes first: the form posts, or the site asks for a human.
    const first = await Promise.race([
      applyResponse.then(() => 'posted' as const).catch(() => null),
      pollFor(
        async () => {
          const state = await verificationState(page, SUBMIT);
          return state.blocked ? state : null;
        },
        20_000,
        500,
      ),
    ]);

    if (first && first !== 'posted') {
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined);
      // catch page content an cookies
      const html = await page.content();
      const cookies = JSON.stringify(await page.context().cookies());
      const pageUrl = await page.url();

      await this.adapterHelper.savePageData('workable', html, cookies, pageUrl);
      const asked = `Workable asked for human verification (${first.indicators[0] ?? 'challenge shown'})`;
      // Plato never solves or sidesteps this. Headless: nobody can act, stop
      // here with everything prepared. Headed: hand the window to the person.
      if (!headed || !onHumanCheck)
        throw new HumanNeededError(asked, first.indicators);
      await onHumanCheck(first.indicators);
      const outcome = await waitForHumanVerification(page, {
        submitSelector: SUBMIT,
        isSubmitted: () => posted,
        timeoutMs: verificationWaitMs,
      });
      if (outcome === 'timeout')
        throw new HumanNeededError(asked, first.indicators, true);
      await onVerificationCompleted?.();
      // Most sites post by themselves once the check passes. If this one
      // didn't, press Submit once: only when enabled, and only when no
      // request has left the page, so an application is never sent twice.
      if (!posted) {
        const button = page.locator(SUBMIT).first();
        if (await button.isEnabled().catch(() => false)) await ui.click(button);
      }
    }

    // Bounded from here: a form that never posts must not hang the worker.
    const res = await Promise.race([
      applyResponse.catch(() => null),
      new Promise<null>((r) =>
        setTimeout(() => r(null), posted ? 90_000 : 45_000),
      ),
    ]);
    if (!res) {
      const state = await verificationState(page, SUBMIT);
      if (state.blocked)
        throw new HumanNeededError(
          'Workable is still waiting for human verification',
          state.indicators,
        );
    }
    if (!res) {
      // No request left the page: client-side validation stopped it. Say
      // exactly which checks fired, and keep a picture of it.
      const problems = await page.evaluate(() => {
        const texts = Array.from(
          document.querySelectorAll('[role="alert"], [id$="_error"]'),
        ).map((e) => (e.textContent ?? '').trim());
        const fields = Array.from(
          // Native constraint validation leaves no message, only :invalid.
          document.querySelectorAll(
            '[aria-invalid="true"], input:invalid, textarea:invalid, select:invalid',
          ),
        ).map((e) => e.getAttribute('data-ui') ?? e.getAttribute('name') ?? '');
        return [...new Set([...texts, ...fields])].filter(Boolean).slice(0, 8);
      });
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined);
      throw new SiteRejectedError(
        problems.length
          ? `Workable's form would not submit: ${problems.join('; ')}`
          : 'Workable rejected the form before sending',
        problems,
      );
    }
    if (res.ok()) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        dryRun: false,
        confirmation: `Workable accepted the application (HTTP ${res.status()})`,
        screenshot: screenshotPath,
      };
    }
    const body = (await res.text().catch(() => '')).slice(0, 300);
    if (res.status() === 403 || /turnstile|captcha/i.test(body))
      throw new HumanNeededError(
        `Workable refused the application pending verification (HTTP ${res.status()})`,
        [`HTTP ${res.status()}`],
      );
    if (res.status() >= 500)
      throw new Error(`Workable returned ${res.status()}`);
    throw new PermanentApplyError(
      `Workable rejected the application (HTTP ${res.status()}): ${body}`,
    );
  }
}
