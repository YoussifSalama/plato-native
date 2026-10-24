/**
 * Phase 0 spike driver for Plato v3: one Chromium tab over raw CDP, extended from Anthropic's
 * claude-quickstarts/browser-toolset example (navigate, read_page, left_click, get_page_text, wait) with the members an
 * application form needs: form_input, type, key, scroll, scroll_to, find, hover, double_click, screenshot, zoom,
 * file_upload. Not production code: no dialog handling, no request interception, one tab.
 *
 * The same member contract is what the extension executor will implement in Phase 2 over chrome.debugger.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  BetaAbstractBrowserToolset20260801,
  ToolError,
  type BetaBrowserNavigateResult,
  type BetaBrowserState,
  type BetaBrowserToolsetOptions,
  type BetaScreenshotResult,
  type BetaToolsetCallContext,
} from '@anthropic-ai/sdk/helpers/beta/toolsets';
import type {
  BetaBrowserDoubleClickInput,
  BetaBrowserFileUploadInput,
  BetaBrowserFindInput,
  BetaBrowserFormInputInput,
  BetaBrowserGetPageTextInput,
  BetaBrowserHoverInput,
  BetaBrowserKeyInput,
  BetaBrowserLeftClickInput,
  BetaBrowserNavigateInput,
  BetaBrowserReadPageInput,
  BetaBrowserScreenshotInput,
  BetaBrowserScrollInput,
  BetaBrowserScrollToInput,
  BetaBrowserTypeInput,
  BetaBrowserWaitInput,
  BetaBrowserZoomInput,
} from '@anthropic-ai/sdk/resources/beta';
import WebSocket from 'ws';

const COMMAND_TIMEOUT_MS = 30_000;
const TAB_ID = 'tab_1';

export type CdpBrowserOptions = Omit<BetaBrowserToolsetOptions, 'browserState'> & { headless?: boolean; chromePath?: string };

interface CdpMessage { id?: number; method?: string; params?: { name?: string; loaderId?: string }; result?: Record<string, unknown>; error?: { message?: string } }
interface PendingCommand { method: string; resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
type Point = { x: number; y: number };

export function findChrome(chromePath?: string): string {
  const configured = chromePath || process.env['CHROME_PATH'];
  if (configured) return configured;
  for (const dir of (process.env['PATH'] ?? '').split(delimiter))
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
      const found = join(dir, name);
      if (existsSync(found)) return found;
    }
  throw new Error('No Chromium binary found: set CHROME_PATH or install google-chrome / chromium.');
}

/** Describes what the model is about to click, for the Submit gate in spike.ts. */
export interface ElementInfo { tag: string; type: string; text: string; role: string; isSubmit: boolean }

export class CdpBrowser extends BetaAbstractBrowserToolset20260801 {
  private process: ChildProcess | undefined;
  private profileDir: string | undefined;
  private socket: WebSocket | undefined;
  private sessionId = '';
  private nextId = 1;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly events: CdpMessage[] = [];
  /** Every CDP member call, for the spike's journal. */
  readonly journal: string[] = [];

  static async launch(options: CdpBrowserOptions = {}): Promise<CdpBrowser> {
    const { headless = true, chromePath, ...toolsetOptions } = options;
    const browser = new CdpBrowser(toolsetOptions);
    try {
      await browser.connect(await browser.start(headless, chromePath));
    } catch (error) {
      await browser.close();
      throw error;
    }
    return browser;
  }

  private constructor(options: Omit<BetaBrowserToolsetOptions, 'browserState'>) {
    super({ ...options, browserState: () => this.browserState() });
  }

  private async start(headless: boolean, chromePath: string | undefined): Promise<string> {
    const binary = findChrome(chromePath);
    this.profileDir = mkdtempSync(join(tmpdir(), 'plato-v3-spike-'));
    const logFile = join(this.profileDir, 'chromium.log');
    const log = openSync(logFile, 'w');
    const child = spawn(binary, [
      ...(headless ? ['--headless=new'] : []),
      '--remote-debugging-port=0', `--user-data-dir=${this.profileDir}`, '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-extensions', '--disable-sync', '--window-size=1280,900',
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'about:blank',
    ], { stdio: ['ignore', log, log] });
    closeSync(log);
    this.process = child;
    let spawnError = '';
    child.once('error', (error) => (spawnError = error.message));
    const portFile = join(this.profileDir, 'DevToolsActivePort');
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const [port, path] = (existsSync(portFile) ? readFileSync(portFile, 'utf8') : '').split('\n');
      if (port && /^\d+$/.test(port.trim()) && path?.startsWith('/')) return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
      if (spawnError || child.exitCode !== null || child.signalCode !== null) break;
      await sleep(50);
    }
    throw new Error(`Chromium did not start: ${(spawnError || readFileSync(logFile, 'utf8')).trim().split('\n').pop() || 'no output'}`);
  }

  private async connect(wsUrl: string): Promise<void> {
    const socket = new WebSocket(wsUrl);
    await once(socket, 'open');
    this.socket = socket;
    socket.on('message', (raw) => this.receive(String(raw)));
    socket.on('error', (error) => this.failPending(`the browser connection failed: ${error.message}`));
    socket.on('close', () => { this.socket = undefined; this.failPending('the browser connection closed'); });
    const { targetId } = (await this.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    const attached = (await this.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
    this.sessionId = attached.sessionId;
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.send('Page.setLifecycleEventsEnabled', { enabled: true });
    await this.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }

  override async close(): Promise<void> {
    await super.close();
    if (this.socket) { try { await this.send('Browser.close'); } catch { /* already gone */ } this.socket.close(); this.socket = undefined; }
    if (this.process) {
      const child = this.process; this.process = undefined;
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
        child.kill(); const force = setTimeout(() => child.kill('SIGKILL'), 5_000); await exited; clearTimeout(force);
      }
    }
    if (this.profileDir) { for (let i = 0; i < 50; i++) { try { rmSync(this.profileDir, { recursive: true, force: true }); break; } catch { await sleep(100); } } this.profileDir = undefined; }
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new ToolError(`${method} failed: the browser is closed`));
    const id = this.nextId++;
    const command: Record<string, unknown> = { id, method, params };
    if (this.sessionId && !/^(Target|Browser)\./.test(method)) command['sessionId'] = this.sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new ToolError(`${method} timed out`)); }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { method, resolve, reject, timer });
      socket.send(JSON.stringify(command));
    });
  }
  private receive(raw: string): void {
    const message = JSON.parse(raw) as CdpMessage;
    if (message.method === 'Page.lifecycleEvent' && message.params?.name === 'DOMContentLoaded') this.events.push(message);
    if (message.id === undefined) return;
    const command = this.pending.get(message.id);
    if (!command) return;
    this.pending.delete(message.id); clearTimeout(command.timer);
    if (message.error) command.reject(new ToolError(`${command.method} failed: ${message.error.message ?? 'unknown error'}`));
    else command.resolve(message.result ?? {});
  }
  private failPending(reason: string): void {
    for (const [id, c] of this.pending) { this.pending.delete(id); clearTimeout(c.timer); c.reject(new ToolError(`${c.method} failed: ${reason}`)); }
  }
  private async evaluate<T>(expression: string): Promise<T | undefined> {
    const r = (await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as { result?: { value?: T }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
    if (r.exceptionDetails) throw new ToolError(`the page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  }
  private async pageInfo(): Promise<{ url: string; title: string }> {
    const info = (await this.evaluate<{ url?: string; title?: string }>(PAGE_INFO)) ?? {};
    return { url: String(info.url ?? 'about:blank'), title: String(info.title ?? '') };
  }
  private async resolve(ref: string): Promise<Point> {
    const found = await this.evaluate<Point | null>(`${RESOLVE_REF}(${JSON.stringify(ref)})`);
    if (!found) throw new ToolError(`Unknown or stale ref: ${ref}. Call read_page again for current refs.`);
    return found;
  }
  private async point(target: { type: 'ref'; ref: string } | { type: 'coordinate'; x: number; y: number }): Promise<Point> {
    return target.type === 'ref' ? this.resolve(target.ref) : { x: target.x, y: target.y };
  }
  /**
   * Executor entry for the remote (backend-brain) loop: run one member by name and return the wire result the
   * extension will produce in Phase 2. Text rendering follows the SDK's own (`Navigated to … — title`).
   */
  async exec(name: string, input: Record<string, unknown>): Promise<{ ok: boolean; text?: string; image?: { media_type: 'image/png'; data: string }; state?: { tabs: { tab_id: string; title: string; url: string; active: boolean }[] }; error?: string }> {
    const ctx = {} as BetaToolsetCallContext;
    const state = async () => ({ tabs: (await this.browserState()).tabs.map((t) => ({ tab_id: t.tab_id, title: t.title ?? '', url: t.url, active: !!t.active })) });
    try {
      const i = input as never;
      switch (name) {
        case 'navigate': { const r = await this.navigate(ctx, i); return { ok: true, text: `Navigated to ${r.url}${r.title ? ` — ${r.title}` : ''}`, state: await state() }; }
        case 'read_page': return { ok: true, text: await this.read_page(ctx, i), state: await state() };
        case 'find': return { ok: true, text: await this.find(ctx, i), state: await state() };
        case 'get_page_text': return { ok: true, text: await this.get_page_text(ctx, i), state: await state() };
        case 'left_click': await this.left_click(ctx, i); return { ok: true, text: 'Clicked', state: await state() };
        case 'double_click': await this.double_click(ctx, i); return { ok: true, text: 'Double-clicked', state: await state() };
        case 'hover': await this.hover(ctx, i); return { ok: true, text: 'Hovered', state: await state() };
        case 'type': await this.type_(ctx, i); return { ok: true, text: 'Typed', state: await state() };
        case 'key': await this.key(ctx, i); return { ok: true, text: 'Pressed', state: await state() };
        case 'scroll': await this.scroll(ctx, i); return { ok: true, text: 'Scrolled', state: await state() };
        case 'scroll_to': await this.scroll_to(ctx, i); return { ok: true, text: 'Scrolled into view', state: await state() };
        case 'form_input': return { ok: true, text: await this.form_input(ctx, i), state: await state() };
        case 'screenshot': { const r = await this.screenshot(ctx, i); return { ok: true, image: { media_type: 'image/png', data: r.data }, state: await state() }; }
        case 'zoom': { const r = await this.zoom(ctx, i); return { ok: true, image: { media_type: 'image/png', data: r.data }, state: await state() }; }
        case 'file_upload': return { ok: true, text: await this.file_upload(ctx, i), state: await state() };
        case 'wait': await this.wait(ctx, i); return { ok: true, text: 'Waited', state: await state() };
        case 'list_tabs': return { ok: true, text: 'Tabs listed', state: await state() };
        default: return { ok: false, error: `${name} is not available in this browser.` };
      }
    } catch (e) {
      return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
    }
  }
  /** The interactive tree as the model sees it: the spike's final proof. */
  async finalTree(): Promise<string> { return (await this.evaluate<string>(`${READ_PAGE}('interactive', null)`)) || ''; }
  async png(): Promise<string> { return ((await this.send('Page.captureScreenshot', { format: 'png' })) as { data: string }).data; }
  /** What a ref points at: used by the Submit gate before a click runs. */
  async describe(ref: string): Promise<ElementInfo | null> {
    return (await this.evaluate<ElementInfo | null>(`${DESCRIBE_REF}(${JSON.stringify(ref)})`)) ?? null;
  }
  private async click(p: Point, clickCount = 1, button = 'left'): Promise<void> {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
    for (let i = 1; i <= clickCount; i++) {
      await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button, clickCount: i });
      await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button, clickCount: i });
    }
    await sleep(150);
  }
  private jot(line: string) { this.journal.push(`${new Date().toISOString().slice(11, 19)} ${line}`); }

  // ---- members ----
  protected override async navigate(_ctx: BetaToolsetCallContext, input: BetaBrowserNavigateInput): Promise<BetaBrowserNavigateResult> {
    this.jot(`navigate ${input.url}`);
    if (['back', 'forward', 'reload'].includes(input.url)) {
      await this.evaluate(input.url === 'reload' ? 'location.reload()' : input.url === 'back' ? 'history.back()' : 'history.forward()');
      await sleep(1500);
      const page = await this.pageInfo();
      return { url: page.url, ...(page.title ? { title: page.title } : {}) };
    }
    this.events.length = 0;
    const url = /^[a-z][a-z0-9+.-]*:/i.test(input.url) ? input.url : `https://${input.url}`;
    const started = (await this.send('Page.navigate', { url })) as { errorText?: string; loaderId?: string };
    if (started.errorText) throw new ToolError(`navigate failed: ${started.errorText}`);
    const loaderId = started.loaderId;
    const deadline = Date.now() + COMMAND_TIMEOUT_MS;
    while (loaderId && !this.events.some((e) => e.params?.loaderId === loaderId)) {
      if (!this.socket) throw new ToolError('navigate failed: the browser connection closed');
      if (Date.now() >= deadline) throw new ToolError('navigate failed: the page did not load within 30 s');
      await sleep(50);
    }
    this.events.length = 0;
    await sleep(1200); // SPA hydration
    const page = await this.pageInfo();
    return { url: page.url, ...(page.title ? { title: page.title } : {}) };
  }
  protected override async read_page(_ctx: BetaToolsetCallContext, input: BetaBrowserReadPageInput): Promise<string> {
    this.jot(`read_page ${JSON.stringify({ filter: input.filter, ref: input.ref })}`);
    return (await this.evaluate<string>(`${READ_PAGE}(${JSON.stringify(input.filter ?? null)}, ${JSON.stringify(input.ref ?? null)})`)) || '';
  }
  protected override async find(_ctx: BetaToolsetCallContext, input: BetaBrowserFindInput): Promise<string> {
    this.jot(`find ${JSON.stringify(input.query)}`);
    return (await this.evaluate<string>(`${FIND}(${JSON.stringify(input.query)})`)) || '';
  }
  protected override async get_page_text(_ctx: BetaToolsetCallContext, _input: BetaBrowserGetPageTextInput): Promise<string> {
    this.jot('get_page_text');
    return (await this.evaluate<string>(PAGE_TEXT)) || '';
  }
  protected override async left_click(_ctx: BetaToolsetCallContext, input: BetaBrowserLeftClickInput): Promise<void> {
    this.jot(`left_click ${JSON.stringify(input.target)}`);
    await this.click(await this.point(input.target));
  }
  protected override async double_click(_ctx: BetaToolsetCallContext, input: BetaBrowserDoubleClickInput): Promise<void> {
    await this.click(await this.point(input.target), 2);
  }
  protected override async hover(_ctx: BetaToolsetCallContext, input: BetaBrowserHoverInput): Promise<void> {
    const p = await this.point(input.target);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  }
  protected override async type_(_ctx: BetaToolsetCallContext, input: BetaBrowserTypeInput): Promise<void> {
    this.jot(`type ${JSON.stringify(input.text.slice(0, 60))}`);
    // Human pace in pieces: frameworks that validate per keystroke see a real sequence of input events.
    for (const piece of input.text.length > 60 ? (input.text.match(/\S+\s*/g) ?? [input.text]) : [...input.text]) {
      await this.send('Input.insertText', { text: piece });
      await sleep(input.text.length > 60 ? 15 : 25);
    }
    await sleep(120);
  }
  protected override async key(_ctx: BetaToolsetCallContext, input: BetaBrowserKeyInput): Promise<void> {
    this.jot(`key ${JSON.stringify(input.text)}`);
    for (let r = 0; r < (input.repeat ?? 1); r++)
      for (const chord of input.text.split(/\s+/).filter(Boolean)) await this.pressChord(chord);
    await sleep(150);
  }
  private async pressChord(chord: string): Promise<void> {
    const parts = chord.split('+');
    const keyName = parts.pop()!;
    const modifiers = parts.reduce((m, p) => m | ({ alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, shift: 8 }[p.toLowerCase()] ?? 0), 0);
    const def = KEYS[keyName] ?? KEYS[keyName.toLowerCase()] ?? (keyName.length === 1 ? { key: keyName, code: `Key${keyName.toUpperCase()}`, vk: keyName.toUpperCase().charCodeAt(0), text: keyName } : undefined);
    if (!def) throw new ToolError(`key: unknown key ${keyName}`);
    const base = { key: def.key, code: def.code, windowsVirtualKeyCode: def.vk, nativeVirtualKeyCode: def.vk, modifiers };
    await this.send('Input.dispatchKeyEvent', { type: def.text && !modifiers ? 'keyDown' : 'rawKeyDown', ...base, ...(def.text && !modifiers ? { text: def.text, unmodifiedText: def.text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  protected override async scroll(_ctx: BetaToolsetCallContext, input: BetaBrowserScrollInput): Promise<void> {
    const p = await this.point(input.target);
    const n = (input.scroll_amount ?? 3) * 100;
    const delta = input.scroll_direction === 'up' ? { deltaY: -n } : input.scroll_direction === 'down' ? { deltaY: n } : input.scroll_direction === 'left' ? { deltaX: -n } : { deltaX: n };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...p, deltaX: 0, deltaY: 0, ...delta });
    await sleep(300);
  }
  protected override async scroll_to(_ctx: BetaToolsetCallContext, input: BetaBrowserScrollToInput): Promise<void> {
    await this.resolve(input.target.ref); // resolving scrolls it into view
  }
  protected override async form_input(_ctx: BetaToolsetCallContext, input: BetaBrowserFormInputInput): Promise<string> {
    this.jot(`form_input ${input.target.ref} = ${JSON.stringify(input.value)}`);
    const r = await this.evaluate<{ ok: boolean; message: string; clickPoint?: Point }>(`${FORM_INPUT}(${JSON.stringify(input.target.ref)}, ${JSON.stringify(input.value)})`);
    if (!r) throw new ToolError('form_input: the page did not answer');
    if (r.clickPoint) { await this.click(r.clickPoint); return r.message; } // boxes get a real click, not a scripted check
    if (!r.ok) throw new ToolError(r.message);
    return r.message;
  }
  protected override async screenshot(_ctx: BetaToolsetCallContext, _input: BetaBrowserScreenshotInput): Promise<BetaScreenshotResult> {
    this.jot('screenshot');
    const r = (await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })) as { data: string };
    return { data: r.data, mediaType: 'image/png' };
  }
  protected override async zoom(_ctx: BetaToolsetCallContext, input: BetaBrowserZoomInput): Promise<BetaScreenshotResult> {
    const [x0 = 0, y0 = 0, x1 = 1280, y1 = 900] = input.region; // [x0, y0, x1, y1] viewport pixels
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const clip = { x: x0, y: y0, width: w, height: h, scale: Math.min(2, 1280 / w) };
    const r = (await this.send('Page.captureScreenshot', { format: 'png', ...(clip && { clip }) })) as { data: string };
    return { data: r.data, mediaType: 'image/png' };
  }
  protected override async file_upload(_ctx: BetaToolsetCallContext, input: BetaBrowserFileUploadInput): Promise<string> {
    this.jot(`file_upload ${input.target.ref} ${JSON.stringify(input.paths ?? input.document_ids)}`);
    const paths = input.paths ?? [];
    if (!paths.length) throw new ToolError('file_upload: this driver takes paths only');
    // mark the element so DOM.querySelector can find it, then hand the file to Chromium itself
    const marked = await this.evaluate<boolean>(`${MARK_REF}(${JSON.stringify(input.target.ref)})`);
    if (!marked) throw new ToolError(`Unknown or stale ref: ${input.target.ref}. Call read_page again for current refs.`);
    const doc = (await this.send('DOM.getDocument', { depth: 0 })) as { root: { nodeId: number } };
    const { nodeId } = (await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-plato-upload="1"]' })) as { nodeId: number };
    if (!nodeId) throw new ToolError('file_upload: the target is not a file input');
    await this.send('DOM.setFileInputFiles', { files: paths, nodeId });
    await this.evaluate(`document.querySelectorAll('[data-plato-upload]').forEach((e) => e.removeAttribute('data-plato-upload'))`);
    await sleep(1500);
    return `Uploaded ${paths.map((p) => p.split('/').pop()).join(', ')}`;
  }
  protected override async wait(_ctx: BetaToolsetCallContext, input: BetaBrowserWaitInput): Promise<void> {
    if (!(input.duration >= 0 && input.duration <= 30)) throw new ToolError('duration: must be between 0 and 30 seconds');
    await sleep(input.duration * 1000);
  }
  private async browserState(): Promise<BetaBrowserState> {
    let page = { url: 'about:blank', title: '' };
    try { page = await this.pageInfo(); } catch { /* tab gone */ }
    return { tabs: [{ tab_id: TAB_ID, url: page.url, title: page.title, active: true }] };
  }
}

const KEYS: Record<string, { key: string; code: string; vk: number; text?: string }> = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' }, Tab: { key: 'Tab', code: 'Tab', vk: 9 }, Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 }, Delete: { key: 'Delete', code: 'Delete', vk: 46 }, ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 }, ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 }, ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Home: { key: 'Home', code: 'Home', vk: 36 }, End: { key: 'End', code: 'End', vk: 35 }, PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 }, PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' }, Space: { key: ' ', code: 'Space', vk: 32, text: ' ' }, a: { key: 'a', code: 'KeyA', vk: 65, text: 'a' },
};

// --- page scripts ---
const PAGE_INFO = '({ url: location.href, title: document.title })';
const PAGE_TEXT = "(document.querySelector('main') || document.body) ? (document.querySelector('main') || document.body).innerText.slice(0, 50000) : ''";

// Shared helpers: refs live on window and survive until a navigation. One registry for read_page, find and the actions.
const HELPERS = `
  const R = (window.__platoRefs ||= { next: 1, byRef: new Map(), byElement: new WeakMap() });
  const refOf = (el) => { let r = R.byElement.get(el); if (!r) { r = 'ref_' + R.next++; R.byElement.set(el, r); R.byRef.set(r, el); } return r; };
  const vis = (el) => { const r = el.getBoundingClientRect(); if (!(r.width > 0 || r.height > 0)) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"]'); };
  const txt = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const labelText = (el) => {
    const byId = (ids) => (ids || '').split(/\\s+/).filter(Boolean).map((i) => document.getElementById(i)).filter(Boolean).map((n) => txt(n.innerText)).join(' ');
    return txt(el.getAttribute('aria-label')) || byId(el.getAttribute('aria-labelledby')) || (el.labels && el.labels[0] ? txt(el.labels[0].innerText) : '') || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]') ? txt(document.querySelector('label[for="' + CSS.escape(el.id) + '"]').innerText) : '') || boxLabel(el) || txt(el.getAttribute('placeholder')) || txt(el.getAttribute('title')) || txt(el.name);
  };
  const boxLabel = (el) => { let box = el; for (let i = 0; i < 4 && box.parentElement; i++) { const up = box.parentElement; if (['FORM','FIELDSET','BODY'].includes(up.tagName)) break; if ([...up.querySelectorAll('input,select,textarea,[role=combobox],[role=textbox]')].some((c) => c !== el && !(c.type === 'radio' || c.type === 'checkbox'))) break; box = up; } if (box === el) return ''; const cands = [...box.querySelectorAll('label,legend,h1,h2,h3,h4,h5,h6,[class*="label" i],[class*="question" i],[class*="title" i],[class*="heading" i],p')].filter((n) => !n.contains(el) && (n.compareDocumentPosition(el) & 4) && !n.querySelector('input,select,textarea')); const n = cands.pop(); return n ? txt(n.innerText).slice(0, 160) : ''; };
  // the pick a type-ahead shows next to its (now empty) text box: the nearest small container's text without the placeholder
  const chosenText = (el) => { let box = el.parentElement; for (let i = 0; i < 3 && box; i++, box = box.parentElement) { const sel = box.querySelector('[class*="single-value" i], [class*="selected-value" i], [class*="selectedValue" i], [class*="value-container" i] > div:not([class*="placeholder" i]):not([class*="input" i])'); if (sel) { const t = txt(sel.innerText); if (t && t !== txt(el.placeholder)) return t; } const t = txt(box.innerText).replace(txt(el.placeholder), '').trim(); if (t && t.length <= 80 && !box.querySelector('input:not([role=combobox]), select, textarea')) return t; } return ''; };
  const required = (el) => !!(el.required || el.getAttribute('aria-required') === 'true' || /[*✱]\\s*$/.test(labelText(el)) || (el.labels && el.labels[0] && /required/i.test(el.labels[0].className)));
  const roleOf = (el) => { const r = el.getAttribute('role'); if (r) return r; const t = el.tagName; if (t === 'A') return 'link'; if (t === 'BUTTON') return 'button'; if (t === 'SELECT') return 'combobox'; if (t === 'TEXTAREA') return 'textbox'; if (/^H[1-6]$/.test(t)) return 'heading'; if (t === 'LABEL' || t === 'LEGEND') return 'text'; if (t === 'INPUT') { const ty = (el.type || 'text').toLowerCase(); return ty === 'checkbox' ? 'checkbox' : ty === 'radio' ? 'radio' : ty === 'file' ? 'file-input' : ty === 'submit' || ty === 'button' ? 'button' : ty === 'number' ? 'spinbutton' : el.getAttribute('aria-autocomplete') ? 'combobox' : 'textbox'; } return 'generic'; };
  const describe = (el) => {
    const role = roleOf(el); const parts = [];
    const name = ['textbox','combobox','checkbox','radio','spinbutton','file-input','listbox'].includes(role) ? labelText(el) : txt(el.innerText || el.value || el.getAttribute('aria-label') || el.alt || '');
    parts.push(role + ' "' + name.slice(0, 120) + '"');
    if (required(el)) parts.push('required');
    if (el.tagName === 'SELECT') { const sel = el.options[el.selectedIndex]; if (sel && sel.value !== '') parts.push('value="' + txt(sel.text).slice(0, 60) + '"'); const opts = [...el.options].filter((o) => o.value !== '').map((o) => txt(o.text)).slice(0, 12); if (opts.length) parts.push('options: ' + opts.join(' | ') + (el.options.length > 13 ? ' | …' : '')); }
    else if (role === 'checkbox' || role === 'radio') parts.push(el.checked || el.getAttribute('aria-checked') === 'true' ? 'checked' : 'unchecked');
    else if (role === 'file-input') parts.push(el.files && el.files.length ? 'file="' + el.files[0].name + '"' : 'no file');
    else if (role === 'combobox') { const own = txt(el.value); const shown = own || chosenText(el); if (shown) parts.push('value="' + shown.slice(0, 60) + '"'); }
    else if ('value' in el && el.value && role !== 'button') parts.push('value="' + txt(el.value).slice(0, 60) + '"');
    if (el.getAttribute('aria-invalid') === 'true') { const ids = (el.getAttribute('aria-errormessage') || el.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean); const e = ids.map((i) => document.getElementById(i)).filter(Boolean).map((n) => txt(n.innerText)).filter(Boolean).join(' / '); parts.push('error="' + (e || 'invalid').slice(0, 100) + '"'); }
    else if (typeof el.checkValidity === 'function' && !el.checkValidity() && el.validationMessage) parts.push('error="' + txt(el.validationMessage).slice(0, 100) + '"'); // native constraint (pattern, type): the browser shows it only as a tooltip
    if (el.disabled) parts.push('disabled');
    return parts.join(' ') + ' [' + refOf(el) + ']';
  };
`;

const READ_PAGE = `((filter, scopeRef) => { ${HELPERS}
  const root = scopeRef ? (R.byRef.get(scopeRef) || document) : document;
  const INTERACTIVE = 'a[href], button, input, select, textarea, [role=button], [role=link], [role=combobox], [role=textbox], [role=checkbox], [role=radio], [role=option], [contenteditable=true]';
  const sel = filter === 'interactive' ? INTERACTIVE : INTERACTIVE + ', h1, h2, h3, h4, legend, label';
  const lines = []; const seenRadio = new Set();
  for (const el of root.querySelectorAll(sel)) {
    if (!vis(el)) continue;
    if (filter !== 'all') { const r = el.getBoundingClientRect(); if (r.bottom < -2000 || r.top > innerHeight + 4000) continue; }
    if (el.tagName === 'LABEL' && el.control) continue; // its control carries the text
    if (el.closest('[role=listbox]') && el.getAttribute('role') !== 'option') continue;
    lines.push(describe(el));
  }
  let out = lines.join('\\n'); if (out.length > 50000) out = out.slice(0, 50000) + '\\n…(truncated)';
  return out;
})`;

const FIND = `((query) => { ${HELPERS}
  const words = txt(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const scored = [];
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=link], [role=combobox], [role=textbox], [role=checkbox], [role=radio], [role=option], h1, h2, h3, label')) {
    if (!vis(el)) continue;
    const hay = (describe(el) + ' ' + labelText(el) + ' ' + (el.name || '') + ' ' + (el.id || '')).toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (score) scored.push([score, describe(el)]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 20).map((s) => s[1]).join('\\n');
})`;

const RESOLVE_REF = `((ref) => {
  const el = window.__platoRefs && window.__platoRefs.byRef.get(ref);
  if (!el || !el.isConnected) return null;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})`;

const DESCRIBE_REF = `((ref) => {
  const el = window.__platoRefs && window.__platoRefs.byRef.get(ref);
  if (!el || !el.isConnected) return null;
  const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const isSubmit = ((el.tagName === 'BUTTON' && el.type === 'submit' && !!el.closest('form')) || (el.tagName === 'INPUT' && el.type === 'submit') || /^(submit( application| my application)?|send( application| my application)?)$/i.test(text)) && !/^(apply|apply now|apply for this job|start application|next|continue|review)$/i.test(text);
  return { tag: el.tagName, type: el.type || '', text, role: el.getAttribute('role') || '', isSubmit };
})`;

const MARK_REF = `((ref) => { const el = window.__platoRefs && window.__platoRefs.byRef.get(ref); if (!el || !el.isConnected) return false; let target = el; if (!(el.tagName === 'INPUT' && el.type === 'file')) { const box = el.closest('form, fieldset, div') || document; target = box.querySelector('input[type=file]') || document.querySelector('input[type=file]'); } if (!target) return false; target.setAttribute('data-plato-upload', '1'); return true; })`;

const FORM_INPUT = `((ref, value) => { ${HELPERS}
  const el = R.byRef.get(ref); if (!el || !el.isConnected) return { ok: false, message: 'Unknown or stale ref: ' + ref + '. Call read_page again for current refs.' };
  const set = (node, v) => { const proto = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const d = Object.getOwnPropertyDescriptor(proto, 'value'); if (d && d.set) d.set.call(node, v); else node.value = v; node.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true })); node.dispatchEvent(new Event('change', { bubbles: true })); };
  const want = String(value);
  if (el.tagName === 'SELECT') {
    const opt = [...el.options].find((o) => o.value === want) || [...el.options].find((o) => txt(o.text).toLowerCase() === want.toLowerCase()) || [...el.options].find((o) => txt(o.text).toLowerCase().includes(want.toLowerCase()));
    if (!opt) return { ok: false, message: 'No option matches "' + want + '". Options: ' + [...el.options].map((o) => txt(o.text)).join(' | ') };
    el.focus(); set(el, opt.value); el.blur();
    return el.value === opt.value ? { ok: true, message: 'Selected "' + txt(opt.text) + '"' } : { ok: false, message: 'The select did not keep the value' };
  }
  const role = roleOf(el);
  if (role === 'checkbox' || role === 'radio') {
    const wantOn = value === true || /^(true|yes|on|checked|1)$/i.test(want);
    const isOn = el.checked || el.getAttribute('aria-checked') === 'true';
    if (isOn === wantOn) return { ok: true, message: (wantOn ? 'Already checked' : 'Already unchecked') };
    const box = (el.labels && el.labels[0] && vis(el.labels[0]) && !vis(el)) ? el.labels[0] : el;
    box.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = box.getBoundingClientRect();
    return { ok: true, message: (wantOn ? 'Checked' : 'Unchecked'), clickPoint: { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 } };
  }
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    el.focus(); set(el, want); el.blur();
    const shown = String(el.value);
    const digits = (s) => s.replace(/\\D/g, '');
    const ok = shown === want || (el.type === 'tel' && digits(want) && (digits(shown) === digits(want) || digits(want).endsWith(digits(shown))));
    return ok ? { ok: true, message: 'Set to "' + shown.slice(0, 60) + '"' } : { ok: false, message: 'The field shows "' + shown.slice(0, 60) + '" instead; for a type-ahead list, click it, type, then click the matching option' };
  }
  return { ok: false, message: 'form_input works on inputs, selects, checkboxes and radios; use left_click and type for this element' };
})`;
