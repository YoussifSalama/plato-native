import type { Page } from 'playwright-core';

// Human-verification handling. Plato DETECTS that a site is asking for a
// person, PAUSES, and WAITS for that person to complete it in the visible
// application window. It never solves, clicks, scripts, extracts tokens
// from, or otherwise works around the challenge: nothing in this file
// interacts with a CAPTCHA widget at all. It only reads the page.

export interface CaptchaFrame {
  provider: string;
  // What the widget itself currently says ("Verify you are human", "Success!").
  text: string;
}

export interface VerificationSignals {
  // Visible CAPTCHA widgets (checkbox-sized or larger).
  frames: CaptchaFrame[];
  // Human-verification wording found in the page itself.
  pageText: string[];
  // Is the form's submit button disabled? null when it can't be read.
  submitDisabled: boolean | null;
}

export interface VerificationState {
  // A human has to act before this form can be submitted.
  blocked: boolean;
  // What told us so, for logs and for the seeker.
  indicators: string[];
}

const PROVIDERS: [string, RegExp][] = [
  ['Cloudflare Turnstile', /challenges\.cloudflare\.com/i],
  ['hCaptcha', /hcaptcha\.com/i],
  ['reCAPTCHA', /recaptcha/i],
];

// Strong wording: only a verification prompt says this.
const ASKING =
  /verify (that )?you('| a)?re (a )?human|confirm (that )?you('| a)?re (a )?human|i'?m not a robot|are you a robot|human verification/i;
// Interstitial wording ("Just a moment..."): ordinary English, so it only
// counts on a near-empty page, never inside a job description.
const INTERSTITIAL = /checking your browser|just a moment/i;
// The widget's own "done" state. A solved widget stays on the page.
// Must not overlap the prompt itself: "Verify you are human" is NOT solved.
const SOLVED =
  /\bsuccess\b|\bverified\b|verification (complete|completed|successful|passed)/i;

// reCAPTCHA v3 / invisible only draws a corner badge ("protected by
// reCAPTCHA", ~256x60). It asks nothing of a person, so it is never a block.
export const isInvisibleWidget = (url: string) =>
  /[?&]size=invisible/i.test(url);

// Pure: decides from what was read off the page. Unit-tested.
export function classifyVerification(
  s: VerificationSignals,
): VerificationState {
  const indicators: string[] = [];
  const pending = s.frames.filter((f) => !SOLVED.test(f.text));
  for (const f of pending)
    indicators.push(
      `${f.provider} widget${f.text ? `: "${f.text.slice(0, 60)}"` : ''}`,
    );
  for (const t of s.pageText) indicators.push(`page says "${t}"`);
  if (s.submitDisabled) indicators.push('submit button is disabled');

  // A visible, unsolved widget blocks. Wording alone blocks only when the
  // submit button isn't usable (wording can sit in static page text).
  const blocked =
    pending.length > 0 || (s.pageText.length > 0 && s.submitDisabled !== false);
  return { blocked, indicators: blocked ? indicators : [] };
}

// Read-only. Frames are found through the browser's frame list because
// Turnstile mounts inside a CLOSED shadow root that a DOM query cannot see.
export async function readVerificationSignals(
  page: Page,
  submitSelector: string,
): Promise<VerificationSignals> {
  const frames: CaptchaFrame[] = [];
  for (const frame of page.frames()) {
    const provider = PROVIDERS.find(([, re]) => re.test(frame.url()))?.[0];
    if (!provider || isInvisibleWidget(frame.url())) continue;
    const box = await frame
      .frameElement()
      .then((el) => el.boundingBox())
      .catch(() => null);
    // Invisible / background frames have no box or are tiny.
    if (!box || box.height <= 40 || box.width <= 150) continue;
    const text = await frame
      .locator('body')
      .innerText({ timeout: 1500 })
      .catch(() => '');
    frames.push({ provider, text: text.replace(/\s+/g, ' ').trim() });
  }

  const pageText = await page
    .evaluate(() => document.body?.innerText ?? '')
    .then((body) => {
      const hit =
        ASKING.exec(body) ??
        (body.trim().length < 600 ? INTERSTITIAL.exec(body) : null);
      return hit ? [hit[0]] : [];
    })
    .catch(() => []);

  const submitDisabled = await page
    .locator(submitSelector)
    .first()
    .isDisabled({ timeout: 1500 })
    .catch(() => null);

  return { frames, pageText, submitDisabled };
}

export const verificationState = async (page: Page, submitSelector: string) =>
  classifyVerification(await readVerificationSignals(page, submitSelector));

// Wait, without touching anything, until the person finished the check.
//   'submitted' - the site already took the form (many sites post by
//                 themselves once the check passes)
//   'completed' - the check is gone/solved and the form is usable again
//   'timeout'   - nobody completed it in time
export async function waitForHumanVerification(
  page: Page,
  options: {
    submitSelector: string;
    isSubmitted: () => boolean;
    timeoutMs: number;
    pollMs?: number;
  },
): Promise<'submitted' | 'completed' | 'timeout'> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (options.isSubmitted()) return 'submitted';
    if (page.isClosed()) return 'timeout';
    const state = await verificationState(page, options.submitSelector);
    if (!state.blocked)
      return options.isSubmitted() ? 'submitted' : 'completed';
    await new Promise((r) => setTimeout(r, options.pollMs ?? 1000));
  }
  return 'timeout';
}
