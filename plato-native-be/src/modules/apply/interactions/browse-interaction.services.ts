import type { Locator, Page } from 'playwright-core';
import { InteractionPolicy } from './interaction.types';

export interface ActionOptions {
  // Hidden-but-real controls (custom checkboxes, file inputs): skip the
  // visibility wait and let Playwright force the action.
  force?: boolean;
  timeout?: number;
}

// Human-paced wrapper over Playwright locators. Built per page, one per
// submit: `new BrowserInteractionService(page-scoped policy)`. Not a Nest
// provider, it holds no state beyond the policy.
export class BrowserInteractionService {
  // APPLY_HUMANIZE=false pauses the human pacing: no cursor, mouse moves,
  // wandering or delays. Real keystrokes in type() stay (autocompletes need them).
  constructor(
    private readonly policy: InteractionPolicy,
    // Per-adapter override of the APPLY_HUMANIZE default.
    private readonly humanize = process.env.APPLY_HUMANIZE !== 'false',
  ) {}

  async fill(locator: Locator, value: string, opts: ActionOptions = {}) {
    await this.waitForInteractable(locator, opts);
    await this.moveTo(locator, opts);
    await locator.fill(value, { timeout: this.timeout(opts) });
    await this.pauseBetweenActions(locator);
  }

  // Real keystrokes: for autocompletes / intl-tel-input that ignore fill().
  async type(locator: Locator, value: string, opts: ActionOptions = {}) {
    await this.waitForInteractable(locator, opts);
    await this.moveTo(locator, opts);
    await locator.click({ timeout: this.timeout(opts) });
    await locator.fill('');
    await locator.pressSequentially(value, {
      delay: this.typingDelay(value),
    });
    await this.pauseBetweenActions(locator);
  }

  async click(locator: Locator, opts: ActionOptions = {}) {
    await this.waitForInteractable(locator, opts);
    await this.moveTo(locator, opts);
    await locator.click({
      force: opts.force,
      timeout: this.timeout(opts),
      position: this.lastPoint,
    });
    await this.pauseBetweenActions(locator);
  }

  async check(locator: Locator, opts: ActionOptions = {}) {
    await this.waitForInteractable(locator, opts);
    await this.moveTo(locator, opts);
    await locator.check({ force: opts.force, timeout: this.timeout(opts) });
    await this.pauseBetweenActions(locator);
  }

  async selectOption(
    locator: Locator,
    option: { label: string },
    opts: ActionOptions = {},
  ) {
    await this.waitForInteractable(locator, opts);
    await this.moveTo(locator, opts);
    await locator.selectOption(option, { timeout: this.timeout(opts) });
    await this.pauseBetweenActions(locator);
  }

  // File inputs are usually hidden; no visibility wait.
  async upload(locator: Locator, filePath: string) {
    await locator.setInputFiles(filePath, {
      timeout: this.policy.actionTimeout,
    });
    await this.pauseBetweenActions(locator);
  }

  // Point (relative to the element) the cursor last aimed at; consumed by click.
  private lastPoint?: { x: number; y: number };

  // Visible cursor + real mouse events. Cosmetic: never lets it break a run.
  private async moveTo(locator: Locator, opts: ActionOptions) {
    this.lastPoint = undefined;
    if (opts.force || !this.humanize) return;
    try {
      const page = locator.page();
      await this.ensureCursor(page);
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
      const box = await locator.boundingBox();
      if (!box) return;
      const x = box.width * (0.25 + Math.random() * 0.5);
      const y = box.height * (0.25 + Math.random() * 0.5);
      this.lastPoint = { x, y };
      await page.mouse.move(box.x + x, box.y + y, {
        steps: Math.round(this.between(12, 30)),
      });
    } catch {
      this.lastPoint = undefined;
    }
  }

  // Floating arrow that follows mousemove; re-added after navigations.
  private async ensureCursor(page: Page) {
    await page.evaluate(() => {
      if (document.getElementById('__plato_cursor')) return;
      const el = document.createElement('div');
      el.id = '__plato_cursor';
      el.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 3-8 8-3z" fill="#4f46e5" stroke="#fff" stroke-width="1.5"/></svg>';
      el.style.cssText =
        'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:opacity .2s,scale .1s;';
      document.documentElement.appendChild(el);
      addEventListener(
        'mousemove',
        (e) => {
          el.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
          el.style.opacity = '1';
        },
        true,
      );
      addEventListener('mousedown', () => (el.style.scale = '0.8'), true);
      addEventListener('mouseup', () => (el.style.scale = '1'), true);
      document.addEventListener('mouseleave', () => (el.style.opacity = '0.2'));
    });
  }

  // Idle time is spent drifting: a few random moves in the viewport, and
  // now and then out to the edge (focus out) before the next action pulls it back in.
  private async wander(page: Page) {
    try {
      await this.ensureCursor(page);
      const vp = page.viewportSize() ?? { width: 1280, height: 720 };
      const out = Math.random() < 0.2;
      const x = out
        ? Math.random() < 0.5
          ? 1
          : vp.width - 2
        : this.between(vp.width * 0.1, vp.width * 0.9);
      const y = this.between(vp.height * 0.1, vp.height * 0.9);
      await page.mouse.move(x, y, { steps: Math.round(this.between(15, 40)) });
    } catch {
      // cosmetic only
    }
  }

  private timeout(opts: ActionOptions) {
    return opts.timeout ?? this.policy.actionTimeout;
  }

  // click/fill/check auto-wait for enabled + stable; only visibility is ours.
  private async waitForInteractable(locator: Locator, opts: ActionOptions) {
    if (opts.force) return;
    await locator.waitFor({ state: 'visible', timeout: this.timeout(opts) });
  }

  private typingDelay(value: string) {
    if (!this.humanize) return 0;
    const { minDuration, maxDuration } = this.policy.typing;
    const total = this.between(minDuration, maxDuration);
    return Math.max(1, Math.round(total / Math.max(value.length, 1)));
  }

  private async pauseBetweenActions(locator: Locator) {
    if (!this.humanize) return;
    const { min, max } = this.policy.actionDelay;
    const started = Date.now();
    const total = this.between(min, max);
    const page = locator.page();
    while (Date.now() - started < total * 0.6 && Math.random() < 0.7)
      await this.wander(page);
    const left = total - (Date.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
  }

  private between(min: number, max: number) {
    return min + Math.random() * (max - min);
  }
}
