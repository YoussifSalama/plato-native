// Engine v3 executor: runs one browser use tool call in the job's tab and answers it the way the tool
// contract expects. Reads and value-setting go to the content script (content/v3-reader.ts); presses,
// keys and screenshots go through chrome.debugger (real input events, the same a hand produces).
// Pure over its deps so the flows are tested without a browser.
//
// Code-enforced, whatever the model asks:
//   - the Submit gate: a press on the Submit control runs only when the backend allowed it, and only once;
//   - nothing else is gated: every other press, key and step of a multi-page form is the brain's own call (the page
//     guard that cancelled form submits was removed 2026-11-24: it stopped Amazon's Continue / Save & continue);
//   - file_upload takes only the staged resume (document id "resume");
//   - tabs: one tab, the job's; nothing opens or closes.
//
// Pacing (the "human" layer, for reliability): a short reading pause before each action, a press only once
// the control is ready (in view, shown, enabled, still, not covered: content/v3-reader.ts `ready`), a hover
// before the press, a pause for the page to settle after it, typing at a person's speed, and a wait after
// typing for suggestion lists. Nothing here is made to look human to bot detection: no random mouse paths,
// no fingerprint changes, and a human check still stops the run for the seeker.
import type { BrowserCall, CallResult } from './contract';
import { REFUSE_PASSWORD, type Changed, type ElementInfo, type PageInfo, type Point, type Readiness, type V3Op } from '../content/v3-reader';

export interface ExecDeps {
  send<T>(msg: V3Op): Promise<T>; // the content script of the job's tab
  cdp(method: string, params?: Record<string, unknown>): Promise<unknown>; // chrome.debugger on the job's tab
  navigate(url: string): Promise<void>; // 'back' | 'forward' | 'reload' | a URL; resolves when the page is loaded and quiet
  settle(): Promise<void>; // resolves when the page is quiet
  activate(): Promise<void>; // bring the tab to the front (Chrome does not paint a background tab for a screenshot)
  resume(): Promise<{ name: string; mime: string; data: string } | string | null>; // the staged resume (base64), or the reason it could not be fetched
  sleep(ms: number): Promise<void>;
  tabInfo?(): Promise<{ url: string; title: string } | null>; // Chrome's own view of the tab, when the page reader is not on the page
  password?(kind: 'new' | 'saved', host: string): Promise<string | null>; // core/vault.ts, only with the seeker's "create accounts" setting on; null = none
  quick?: boolean; // the test build moves fast; real builds at a human pace
}
type Target = { type: 'ref'; ref: string } | { type: 'coordinate'; x: number; y: number };
const TAB = 'tab_1';
export const MAX_SIDE = 1568; // longest side of any image sent to the model, in pixels
// The model never sees or picks a password: it types one of these into a password box and the password goes in here.
export const NEW_PASSWORD = '{{PLATO_NEW_PASSWORD}}';
export const SAVED_PASSWORD = '{{PLATO_PASSWORD}}';
export const REFUSE_PLACEHOLDER = 'Refused: a password placeholder goes only into a password box. Click the password box first, then type it.';
export const REFUSE_SUBMIT = 'Not pressed: this control sends the application, and Plato sends it only after you answer SUBMIT_READY. If this is the last page and every required field holds a correct value, answer SUBMIT_READY; otherwise keep going.';
export const REFUSE_AGAIN = 'Refused: Submit was already pressed once. Read the page and report what it says.';
// Typing appends. A field the page filled after the model's last read (a resume parse, a script) would end up doubled.
export const REFUSE_FILLED = (label: string, value: string) => `Refused: "${label}" already holds "${value}", filled by the page after your last read. Typing would append to it. Read the page again; to replace a value use form_input.`;
const KEYS: Record<string, { key: string; code: string; vk: number; text?: string }> = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  Return: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Home: { key: 'Home', code: 'Home', vk: 36 },
  End: { key: 'End', code: 'End', vk: 35 },
  PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 },
  PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
};
const MODS: Record<string, number> = { alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, shift: 8 };

export function createExecutor(d: ExecDeps) {
  let pressed = false; // Submit pressed once in this run: never again
  const pace = (ms: number) => d.sleep(d.quick ? Math.min(ms, 5) : ms);
  // a person's timing: never the same twice, within a calm range
  const human = (min: number, max: number) => pace(min + Math.random() * (max - min));
  // Where the tab is: from the page reader, else from Chrome, so the model always knows the page after a hand-off.
  const info = async (): Promise<Pick<PageInfo, 'url' | 'title'> | null> => (await d.send<PageInfo | null>({ op: 'info' }).catch(() => null)) ?? (await d.tabInfo?.().catch(() => null)) ?? null;
  const state = async () => {
    const i = await info();
    return { tabs: [{ tab_id: TAB, title: i?.title ?? '', url: i?.url ?? '', active: true }] };
  };
  let k = 1; // screenshot px per CSS px, set by the last screenshot: the model's coordinates are screenshot px
  const point = async (t: Target): Promise<Point> => {
    if (t.type === 'coordinate') return { x: t.x / k, y: t.y / k }; // screenshot px -> CSS px
    // waits until the control can really be pressed; a press that would miss is never sent
    const r = await d.send<Readiness | null>({ op: 'ready', ref: t.ref, capMs: d.quick ? 600 : 4000 });
    if (!r) throw new Error(`Unknown or stale ref: ${t.ref}. Call read_page again for current refs.`);
    if (!r.ok) throw new Error(r.reason);
    return r.point;
  };
  const mouse = (type: string, p: Point, extra: Record<string, unknown> = {}) => d.cdp('Input.dispatchMouseEvent', { type, x: Math.round(p.x), y: Math.round(p.y), ...extra });
  // A person's click: rest on the control (hover effects, menus open), press, hold, release, then let the page
  // react. The hover is capped: a background tab can hold a CDP mouse move until its next frame.
  const click = async (p: Point, count = 1) => {
    await Promise.race([mouse('mouseMoved', p).catch(() => undefined), d.sleep(400)]);
    await human(90, 220);
    for (let i = 1; i <= count; i++) {
      await mouse('mousePressed', p, { button: 'left', clickCount: i });
      await human(55, 130);
      await mouse('mouseReleased', p, { button: 'left', clickCount: i });
      if (i < count) await human(60, 110);
    }
    await human(150, 300);
    await d.settle(); // the page answers a press (a menu opens, a step loads) before anything else happens
  };
  const describe = (t: Target) => d.send<ElementInfo | null>(t.type === 'ref' ? { op: 'describe', ref: t.ref } : { op: 'describe', x: t.x / k, y: t.y / k }).catch(() => null);
  const chord = async (c: string) => {
    const parts = c.split('+');
    const name = parts.pop()!;
    const modifiers = parts.reduce((m, p) => m | (MODS[p.toLowerCase()] ?? 0), 0);
    const def = KEYS[name] ?? KEYS[name.toLowerCase()] ?? (name.length === 1 ? { key: name, code: `Key${name.toUpperCase()}`, vk: name.toUpperCase().charCodeAt(0), text: name } : undefined);
    if (!def) throw new Error(`key: unknown key ${name}`);
    const base = { key: def.key, code: def.code, windowsVirtualKeyCode: def.vk, nativeVirtualKeyCode: def.vk, modifiers };
    const printable = !!def.text && !modifiers;
    await d.cdp('Input.dispatchKeyEvent', { type: printable ? 'keyDown' : 'rawKeyDown', ...base, ...(printable && { text: def.text, unmodifiedText: def.text }) });
    await d.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  };
  // Every image the model sees: the visible viewport only (never the full page), JPEG, longest side <= MAX_SIDE px
  // (the API's per-image limits). CDP clips in document CSS px and renders at clip.scale x devicePixelRatio, so the
  // scale divides the device pixel ratio back out.
  const shot = async (region?: { x: number; y: number; width: number; height: number }) => {
    const m = (await d.cdp('Runtime.evaluate', { expression: '[visualViewport.pageLeft, visualViewport.pageTop, visualViewport.width, visualViewport.height, devicePixelRatio]', returnByValue: true })) as { result?: { value?: number[] } } | undefined;
    const [px = 0, py = 0, vw = 1280, vh = 900, dpr = 1] = m?.result?.value ?? [];
    let c = { x: 0, y: 0, width: vw, height: vh }, scale: number;
    if (region) {
      c = { x: region.x / k, y: region.y / k, width: region.width / k, height: region.height / k };
      scale = Math.min(2, MAX_SIDE / Math.max(c.width, c.height)); // a zoom may enlarge a small region, up to 2x
    } else scale = k = Math.min(1, MAX_SIDE / Math.max(vw, vh));
    const clip = { x: px + c.x, y: py + c.y, width: c.width, height: c.height, scale: scale / dpr };
    const take = () => d.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip }) as Promise<{ data: string }>;
    try {
      return await take();
    } catch {
      await d.activate(); // ponytail: a background tab is not painted; bring it forward once and try again
      await d.sleep(300);
      return take();
    }
  };

  // Actions a person would look at the page before doing: a short reading pause first.
  const LOOK_FIRST = new Set(['left_click', 'double_click', 'type', 'key', 'form_input', 'file_upload', 'scroll', 'hover']);

  async function run(name: string, input: Record<string, unknown>, allowed: boolean): Promise<Omit<CallResult, 'call_id'>> {
    const t = input.target as Target;
    if (LOOK_FIRST.has(name)) await human(350, 850);
    switch (name) {
      case 'navigate': {
        await d.navigate(String(input.url ?? ''));
        const i = await info();
        return { ok: true, text: `Navigated to ${i?.url ?? String(input.url)}${i?.title ? ` — ${i.title}` : ''}`, state: await state() };
      }
      case 'read_page':
        return { ok: true, text: await d.send<string>({ op: 'read_page', filter: input.filter as string | undefined, ref: input.ref as string | undefined }), state: await state() };
      case 'find':
        return { ok: true, text: await d.send<string>({ op: 'find', query: String(input.query ?? '') }), state: await state() };
      case 'get_page_text':
        return { ok: true, text: await d.send<string>({ op: 'page_text' }), state: await state() };
      case 'left_click':
      case 'double_click': {
        const el = await describe(t);
        const count = name === 'double_click' ? 2 : 1;
        if (el?.isSubmit) {
          if (!allowed) return { ok: false, error: REFUSE_SUBMIT };
          if (pressed) return { ok: false, error: REFUSE_AGAIN };
          pressed = true; // recorded BEFORE the press: a failure after this is still one press
          await click(await point(t), count);
          return { ok: true, text: `Clicked "${el.text}" (Submit)`, state: await state() };
        }
        // everything else is the brain's call: a step of a multi-page form, a checkbox, a menu (no gate, 2026-11-24)
        await click(await point(t), count);
        return { ok: true, text: `Clicked${el?.text ? ` "${el.text.slice(0, 60)}"` : ''}${el?.isStep ? ' (next step)' : ''}`, state: await state() };
      }
      case 'hover':
        await Promise.race([mouse('mouseMoved', await point(t)).catch(() => undefined), d.sleep(400)]);
        await human(250, 500);
        return { ok: true, text: 'Hovered', state: await state() };
      case 'type': {
        const text = String(input.text ?? '');
        // a person looks at the field first: a value the page put there since the last read is not typed over
        const ch = await d.send<Changed | null>({ op: 'changed' }).catch(() => null);
        const hit = ch?.active ? ch.fields.find((f) => f.ref === ch.active) : undefined;
        // passwords: only a placeholder, only into a password box; the real one comes from this browser's vault
        const secret = text.trim() === NEW_PASSWORD ? 'new' : text.trim() === SAVED_PASSWORD ? 'saved' : null;
        if (ch?.password || secret) {
          if (!secret) return { ok: false, error: REFUSE_PASSWORD };
          if (!ch?.password) return { ok: false, error: REFUSE_PLACEHOLDER };
          const url = (await info())?.url ?? '';
          const host = URL.canParse(url) ? new URL(url).hostname : '';
          const pw = host ? await d.password?.(secret, host).catch(() => null) : null;
          if (!pw) return { ok: false, error: secret === 'new' ? 'Refused: Plato cannot make an account here (the seeker has not allowed it). Answer ACCOUNT_REQUIRED <the site>.' : `Refused: Plato did not make an account on ${host || 'this site'} (no saved password in this browser), so the account that exists is the seeker's own. Answer LOGIN_REQUIRED <that an account for the seeker's email already exists on this site>.` };
          await d.cdp('Input.insertText', { text: pw });
          await d.send({ op: 'typed' }).catch(() => undefined);
          await human(200, 400);
          return { ok: true, text: 'Typed the password (hidden)', state: await state() };
        }
        if (hit) return { ok: false, error: REFUSE_FILLED(hit.label, hit.value) };
        // short values letter by letter, long answers word by word, at a typing pace
        for (const piece of text.length > 60 ? (text.match(/\S+\s*/g) ?? [text]) : [...text]) {
          await d.cdp('Input.insertText', { text: piece });
          await (text.length > 60 ? human(20, 60) : human(45, 120));
        }
        await d.send({ op: 'typed' }).catch(() => undefined); // the value is ours now
        await human(200, 400);
        await d.settle(); // a type-ahead fetches its suggestions now: let them arrive before the next look
        return { ok: true, text: 'Typed', state: await state() };
      }
      case 'key': {
        const chords = String(input.text ?? '').split(/\s+/).filter(Boolean);
        for (let r = 0; r < Number(input.repeat ?? 1); r++) for (const c of chords) await chord(c);
        await d.send({ op: 'typed' }).catch(() => undefined); // a Backspace or a shortcut changed the value: ours
        await human(150, 300);
        await d.settle();
        return { ok: true, text: 'Pressed', state: await state() };
      }
      case 'scroll': {
        const p = await point(t);
        const n = Number(input.scroll_amount ?? 3) * 100;
        const dir = String(input.scroll_direction ?? 'down');
        await mouse('mouseWheel', p, { deltaX: dir === 'left' ? -n : dir === 'right' ? n : 0, deltaY: dir === 'up' ? -n : dir === 'down' ? n : 0 });
        await human(300, 600);
        await d.settle(); // content that loads as it comes into view
        return { ok: true, text: 'Scrolled', state: await state() };
      }
      case 'scroll_to':
        await point(t); // resolving scrolls it into view
        return { ok: true, text: 'Scrolled into view', state: await state() };
      case 'form_input': {
        if (t?.type !== 'ref') return { ok: false, error: 'form_input needs a ref target' };
        const r = await d.send<{ ok: boolean; message: string; clickPoint?: Point } | null>({ op: 'form_input', ref: t.ref, value: input.value });
        if (!r) return { ok: false, error: 'form_input: the page did not answer' };
        if (r.clickPoint) {
          await click(r.clickPoint); // boxes get a real click, not a scripted tick
          return { ok: true, text: r.message, state: await state() };
        }
        if (!r.ok) return { ok: false, error: r.message };
        await d.settle(); // a choice can reveal or reload fields (a city after a country)
        return { ok: true, text: r.message, state: await state() };
      }
      case 'screenshot':
        return { ok: true, image: { media_type: 'image/jpeg', data: (await shot()).data }, state: await state() };
      case 'zoom': {
        const [x0 = 0, y0 = 0, x1 = 1280, y1 = 900] = (input.region as number[] | undefined) ?? [];
        const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
        return { ok: true, image: { media_type: 'image/jpeg', data: (await shot({ x: x0, y: y0, width: w, height: h })).data }, state: await state() };
      }
      case 'file_upload': {
        const ids = (input.document_ids as string[] | undefined) ?? [];
        if (t?.type !== 'ref' || input.paths || ids.length !== 1 || ids[0] !== 'resume') return { ok: false, error: 'Refused: upload only the staged resume (document_ids: ["resume"]) onto a ref.' };
        const file = await d.resume();
        if (!file || typeof file === 'string') return { ok: false, error: `Plato could not fetch the seeker's resume: ${file || 'no resume was chosen for this application'}. Do not retry the upload; stop with BLOCKED and quote this reason.` };
        const r = await d.send<{ ok: boolean; message: string }>({ op: 'set_file', ref: t.ref, ...file });
        if (!r.ok) return { ok: false, error: r.message };
        // The page may parse the file and fill fields from it, a few seconds later (Lever: name, email, phone,
        // links). Wait for that and say which fields it filled, so the model reads them instead of typing over them.
        await d.sleep(d.quick ? 50 : 1500);
        const filledBy = async () => (await d.send<Changed | null>({ op: 'changed' }).catch(() => null))?.fields ?? [];
        let filled = await filledBy();
        for (let i = 0; !filled.length && i < (d.quick ? 0 : 8); i++) {
          await d.sleep(500);
          filled = await filledBy();
        }
        if (filled.length && !d.quick) {
          await d.sleep(1000); // the rest of the parse lands
          filled = await filledBy();
        }
        const note = filled.length ? `. The page then filled from it: ${filled.map((f) => `${f.label} = "${f.value}"`).join('; ')}. Do not type into those; read the page again.` : '';
        return { ok: true, text: r.message + note, state: await state() };
      }
      case 'wait': {
        const s = Number(input.duration ?? 1);
        if (!(s >= 0 && s <= 30)) return { ok: false, error: 'duration: must be between 0 and 30 seconds' };
        await d.sleep(d.quick ? Math.min(s * 1000, 50) : s * 1000);
        await d.settle();
        return { ok: true, text: 'Waited', state: await state() };
      }
      case 'list_tabs':
        return { ok: true, text: 'Tabs listed', state: await state() };
      default:
        return { ok: false, error: `${name} is not available in this browser.` };
    }
  }

  return {
    /** One call, never thrown: a failure is the model's tool result. */
    async exec(call: BrowserCall, submitAllowed: boolean): Promise<CallResult> {
      try {
        return { call_id: call.call_id, ...(await run(call.name, call.input ?? {}, submitAllowed)) };
      } catch (e) {
        return { call_id: call.call_id, ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
      }
    },
    submitPressed: () => pressed,
  };
}
export type Executor = ReturnType<typeof createExecutor>;
