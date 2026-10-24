import { Injectable } from '@nestjs/common';
import { basename } from 'path';
import type { Locator, Page } from 'playwright-core';
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
  GreenhouseJobForm,
  greenhouseApplyUrl,
  greenhouseIds,
  normalizeGreenhouseForm,
} from '../forms/greenhouse.form';
import {
  verificationState,
  waitForHumanVerification,
} from '../human-verification';
import {
  ApplyAdapter,
  BROWSER_UA,
  fillWhenVisible,
  pollFor,
  SubmitOptions,
} from './apply-adapter';

import { BrowserInteractionService } from '../interactions/browse-interaction.services';
import { INTERACTION_POLICIES } from '../interactions/interaction.policy';
const SUBMIT = 'button[type="submit"]';
// Greenhouse's thank-you page after a successful application.
const THANKS =
  /thank you for applying|application (has been )?(received|submitted)|we('| ha)ve received your application|track your (application|status)|sign in to mygreenhouse|candidatura foi recebida|obrigado por se candidatar/i;

// `question_123[]` and friends are valid ids on Greenhouse; escape for CSS.
// The API calls the city field `location`; the page's input is `candidate-location`.
const DOM_ID: Record<string, string> = { location: 'candidate-location' };
const byId = (id: string) =>
  `[id="${(DOM_ID[id] ?? id).replace(/(["\\])/g, '\\$1')}"]`;

@Injectable()
export class GreenhouseApplyAdapter implements ApplyAdapter {
  readonly source = 'GREENHOUSE' as const;

  async loadForm(jobUrl: string): Promise<FormSchema> {
    const ids = greenhouseIds(jobUrl);
    if (!ids)
      throw new PermanentApplyError(
        'This Greenhouse posting is on a custom careers site Plato cannot map to a Greenhouse board',
        'unsupported',
      );
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ids.board)}/jobs/${ids.id}?questions=true`,
      { headers: { accept: 'application/json', 'user-agent': BROWSER_UA } },
    );
    if (res.status === 404)
      throw new JobExpiredError('This Greenhouse posting is closed');
    if (!res.ok) throw new Error(`Greenhouse job API returned ${res.status}`);
    return normalizeGreenhouseForm(
      (await res.json()) as GreenhouseJobForm,
      greenhouseApplyUrl(ids.board, ids.id),
    );
  }

  // Greenhouse selects are comboboxes: type, then pick the exact option.
  private async pickOption(
    ui: BrowserInteractionService,
    page: Page,
    input: Locator,
    option: string,
  ) {
    // Real keystrokes with a small gap: the location box searches as you type
    // and drops results when the text lands instantly (or via fill()).
    await ui.click(input);
    await input.fill('');
    await input.pressSequentially(option, { delay: 60 });
    const esc = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Plain selects list the exact label. The location box is an async search
    // whose options read "Cairo, Egypt": a bare city never matches exactly,
    // so accept "<city>" or "<city>, ..." (the site ranks the best one first).
    const hit = page
      .locator('[role="option"]')
      .filter({ hasText: new RegExp(`^\\s*${esc}\\s*(,.*)?$`, 'i') })
      .first();
    // ponytail: isVisible() ignores its timeout, so wait explicitly.
    const found = await hit
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (found) return ui.click(hit);
    await input.press('Enter');
  }

  // Second pass: re-type any plain text input that ended up empty.
  private async refillWiped(
    page: Page,
    ui: BrowserInteractionService,
    schema: FormSchema,
    answers: Answers,
    resumePath: string,
  ) {
    for (const f of schema.fields) {
      const v = answers[f.id];
      if (typeof v !== 'string' || !v || f.type === 'file') continue;
      const el = page.locator(byId(f.id)).first();
      if (!(await el.count())) continue;
      const plain = await el
        .evaluate(
          (e) =>
            ['INPUT', 'TEXTAREA'].includes(e.tagName) &&
            !['checkbox', 'radio', 'file'].includes(
              (e as HTMLInputElement).type,
            ) &&
            e.getAttribute('role') !== 'combobox',
        )
        .catch(() => false);
      if (plain && !(await el.inputValue().catch(() => 'x')))
        await el.fill(v).catch(() => undefined);
    }
    // The CV: once attached the page shows its file name in place of the
    // upload input. Missing name + input back = it was wiped, attach again.
    const name = basename(resumePath);
    const attached = await page
      .evaluate((n) => document.body.innerText.includes(n), name)
      .catch(() => true);
    const input = page.locator('input[type="file"]#resume');
    if (!attached && (await input.count())) await ui.upload(input, resumePath);
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
      throw new JobExpiredError('This Greenhouse posting is closed');
    await page.waitForSelector('#first_name', { timeout: 30_000 });
    // The form is server-rendered, then React hydrates and RESETS inputs.
    // Anything typed or attached before that is wiped (seen live: empty
    // first name, no CV, "required" errors). Let it settle first.
    await page
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => undefined);

    await ui.upload(
      page.locator('input[type="file"]#resume, input[type="file"]').first(),
      resumePath,
    );

    await fillWhenVisible(schema.fields, async (field) => {
      const value = answers[field.id];
      if (value === undefined || field.type === 'file') return true;

      if (field.type === 'multi' && Array.isArray(value)) {
        // Checkbox group named question_N[]; tick the boxes whose label matches.
        const boxes = page.locator(
          `input[type="checkbox"][name="${field.id}"]`,
        );
        if (!(await boxes.count())) return false;
        for (let i = 0; i < (await boxes.count()); i++) {
          const box = boxes.nth(i);
          const label = await box
            .evaluate(
              (el) => (el as HTMLInputElement).labels?.[0]?.textContent ?? '',
            )
            .catch(() => '');
          if (value.some((v) => label.trim().toLowerCase() === v.toLowerCase()))
            await ui.check(box, { force: true });
        }
        return true;
      }

      const el = page.locator(byId(field.id)).first();
      if (!(await el.count())) return false; // not there (yet), or not on this form

      if (field.type === 'boolean') {
        if (value === true) await ui.check(el, { force: true });
        return true;
      }
      if (field.id === 'cover_letter_text' && !(await el.isVisible())) {
        // Typed cover letters hide behind an "Enter manually" button.
        await ui
          .click(
            page
              .locator('button, [role="button"]')
              .filter({ hasText: /enter manually/i })
              .last(),
          )
          .catch(() => undefined);
      }
      if (typeof value !== 'string') return true;
      if (!(await el.isVisible())) return false;
      if ((await el.getAttribute('role')) === 'combobox')
        await this.pickOption(ui, page, el, value);
      else await ui.fill(el, value);
      return true;
    });

    await this.refillWiped(page, ui, schema, answers, resumePath);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (dryRun)
      return {
        dryRun: true,
        confirmation: 'Dry run: form filled, not submitted',
        screenshot: screenshotPath,
      };

    // (C) Submitted only when Greenhouse shows its thank-you page.
    // Every frame: embedded boards submit inside an iframe, so the top page's
    // URL and text never change. The thank-you copy is localised per board.
    const thanked = async () => {
      for (const frame of page.frames()) {
        if (/job_app\/confirmation|[?&/]confirmation/i.test(frame.url()))
          return true;
        const text = await frame
          .evaluate(() => document.body?.innerText ?? '')
          .catch(() => '');
        if (THANKS.test(text)) return true;
      }
      return false;
    };
    let thankedNow = false;
    let refusal: { status: number; body: string } | null = null;
    page.on('response', (r) => {
      if (r.request().method() !== 'POST' || !/greenhouse\.io/.test(r.url()))
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
    // Last look before Submit: a late re-render can wipe fields after the
    // fill pass above.
    await page.waitForTimeout(800);
    await this.refillWiped(page, ui, schema, answers, resumePath);
    await ui.click(page.locator(SUBMIT).last());

    type Outcome =
      | { kind: 'submitted' }
      | { kind: 'human'; indicators: string[] }
      | { kind: 'rejected'; message: string };
    const settle = (ms: number) =>
      pollFor<Outcome>(async () => {
        if (await thanked()) {
          thankedNow = true;
          return { kind: 'submitted' };
        }
        if (refusal)
          return {
            kind: 'rejected',
            message: `Greenhouse refused the application (HTTP ${refusal.status})${refusal.body ? `: ${refusal.body}` : ''}`,
          };
        const state = await verificationState(page, SUBMIT);
        if (state.blocked)
          return { kind: 'human', indicators: state.indicators };
        // Field-level validation messages the form shows next to inputs.
        const errors = await page
          .locator('[class*="error" i]:visible, [role="alert"]:visible')
          .allTextContents()
          .catch((): string[] => []);
        const shown = errors.map((e) => e.trim()).filter(Boolean);
        return shown.length
          ? {
              kind: 'rejected',
              message: `Greenhouse's form would not submit: ${shown.slice(0, 5).join('; ')}`,
            }
          : null;
      }, ms);

    let outcome = await settle(45_000);

    if (outcome?.kind === 'human') {
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined);
      const asked = `Greenhouse asked for human verification (${outcome.indicators[0] ?? 'challenge shown'})`;
      // Plato never solves or sidesteps this.
      if (!headed || !onHumanCheck)
        throw new HumanNeededError(asked, outcome.indicators);
      await onHumanCheck(outcome.indicators);
      const waited = await waitForHumanVerification(page, {
        submitSelector: SUBMIT,
        isSubmitted: () => thankedNow,
        timeoutMs: verificationWaitMs,
      });
      if (waited === 'timeout')
        throw new HumanNeededError(asked, outcome.indicators, true);
      await onVerificationCompleted?.();
      outcome = await settle(60_000);
    }

    if (!outcome)
      throw new Error('Greenhouse did not confirm the submission in time');
    if (outcome.kind === 'submitted') {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        dryRun: false,
        confirmation: 'Greenhouse confirmation page reached',
        screenshot: screenshotPath,
      };
    }
    if (outcome.kind === 'human')
      throw new HumanNeededError(
        'Greenhouse asked for human verification again after the first one was completed',
        outcome.indicators,
      );
    throw new SiteRejectedError(outcome.message, [outcome.message]);
  }
}
