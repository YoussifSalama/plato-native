// Engine v3 executor: runs one browser use tool call in the job's tab and answers it the way the tool
// contract expects. Reads and value-setting go to the content script (content/v3-reader.ts); presses,
// keys and screenshots go through chrome.debugger (real input events, the same a hand produces).
// Pure over its deps so the flows are tested without a browser.
//
// Code-enforced, whatever the model asks:
//   - the Submit gate: a press on the Submit control runs only when the backend allowed it, and only once;
//   - the page guard: every other press and key runs with form submission cancelled, before Submit is allowed
//     and after it too, so the one Submit press is the only way the form is ever sent (an Enter in a field
//     or a second control that submits the form cannot send it again);
//   - file_upload takes only the staged resume (document id "resume");
//   - tabs: one tab, the job's; nothing opens or closes.
//
// Pacing (the "human" layer, for reliability): a short reading pause before each action, a press only once
// the control is ready (in view, shown, enabled, still, not covered: content/v3-reader.ts `ready`), a hover
// before the press, a pause for the page to settle after it, typing at a person's speed, and a wait after
// typing for suggestion lists. Nothing here is made to look human to bot detection: no random mouse paths,
// no fingerprint changes, and a human check still stops the run for the seeker.
import type { BrowserCall, CallResult } from './contract';
import type { ElementInfo, PageInfo, Point, Readiness, V3Op } from '../content/v3-reader';

export interface ExecDeps {
  send<T>(msg: V3Op): Promise<T>; // the content script of the job's tab
  cdp(method: string, params?: Record<string, unknown>): Promise<unknown>; // chrome.debugger on the job's tab
  navigate(url: string): Promise<void>; // 'back' | 'forward' | 'reload' | a URL; resolves when the page is loaded and quiet
  settle(): Promise<void>; // resolves when the page is quiet
  activate(): Promise<void>; // bring the tab to the front (Chrome does not paint a background tab for a screenshot)
  resume(): Promise<{ name: string; mime: string; data: string } | null>; // the staged resume (base64), or why not
  sleep(ms: number): Promise<void>;
  quick?: boolean; // the test build moves fast; real builds at a human pace
}
type Target = { type: 'ref'; ref: string } | { type: 'coordinate'; x: number; y: number };
const TAB = 'tab_1';
export const REFUSE_SUBMIT = 'Refused: Submit is not allowed yet. Answer SUBMIT_READY when every required field holds a correct value.';
export const REFUSE_AGAIN = 'Refused: Submit was already pressed once. Read the page and report what it says.';
export const REFUSE_OTHER_SUBMIT = 'Refused: that action would have submitted the form; it was cancelled. Submit only with the Submit control itself, once.';
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
  const info = () => d.send<PageInfo | null>({ op: 'info' }).catch(() => null);
  const state = async () => {
    const i = await info();
    return { tabs: [{ tab_id: TAB, title: i?.title ?? '', url: i?.url ?? '', active: true }] };
  };
  const point = async (t: Target): Promise<Point> => {
    if (t.type === 'coordinate') return { x: t.x, y: t.y };
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
  const describe = (t: Target) => d.send<ElementInfo | null>(t.type === 'ref' ? { op: 'describe', ref: t.ref } : { op: 'describe', x: t.x, y: t.y }).catch(() => null);
  // Every press and key except the one Submit press runs under the page guard: a form submit it triggers is
  // cancelled and reported. Allowed or not: once allowed, only the Submit control may send the form, and only once.
  const guarded = async (allowed: boolean, fn: () => Promise<void>) => {
    await d.send({ op: 'guard', ms: 1500 });
    await fn();
    await d.sleep(d.quick ? 50 : 250);
    const g = await d.send<{ blocked: number }>({ op: 'guarded' }).catch(() => ({ blocked: 0 }));
    if (g.blocked) throw new Error(allowed && !pressed ? REFUSE_OTHER_SUBMIT : pressed ? `${REFUSE_OTHER_SUBMIT} ${REFUSE_AGAIN}` : `Refused: that action would have submitted the form; it was cancelled. ${REFUSE_SUBMIT}`);
  };
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
  const shot = async (clip?: Record<string, number>) => {
    const take = () => d.cdp('Page.captureScreenshot', { format: 'png', ...(clip && { clip }) }) as Promise<{ data: string }>;
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
        await guarded(allowed, async () => click(await point(t), count));
        return { ok: true, text: `Clicked${el?.text ? ` "${el.text.slice(0, 60)}"` : ''}`, state: await state() };
      }
      case 'hover':
        await Promise.race([mouse('mouseMoved', await point(t)).catch(() => undefined), d.sleep(400)]);
        await human(250, 500);
        return { ok: true, text: 'Hovered', state: await state() };
      case 'type': {
        const text = String(input.text ?? '');
        // short values letter by letter, long answers word by word, at a typing pace
        for (const piece of text.length > 60 ? (text.match(/\S+\s*/g) ?? [text]) : [...text]) {
          await d.cdp('Input.insertText', { text: piece });
          await (text.length > 60 ? human(20, 60) : human(45, 120));
        }
        await human(200, 400);
        await d.settle(); // a type-ahead fetches its suggestions now: let them arrive before the next look
        return { ok: true, text: 'Typed', state: await state() };
      }
      case 'key': {
        const chords = String(input.text ?? '').split(/\s+/).filter(Boolean);
        await guarded(allowed, async () => {
          for (let r = 0; r < Number(input.repeat ?? 1); r++) for (const c of chords) await chord(c);
        });
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
          await guarded(allowed, () => click(r.clickPoint!)); // boxes get a real click, not a scripted tick
          return { ok: true, text: r.message, state: await state() };
        }
        if (!r.ok) return { ok: false, error: r.message };
        await d.settle(); // a choice can reveal or reload fields (a city after a country)
        return { ok: true, text: r.message, state: await state() };
      }
      case 'screenshot':
        return { ok: true, image: { media_type: 'image/png', data: (await shot()).data }, state: await state() };
      case 'zoom': {
        const [x0 = 0, y0 = 0, x1 = 1280, y1 = 900] = (input.region as number[] | undefined) ?? [];
        const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
        return { ok: true, image: { media_type: 'image/png', data: (await shot({ x: x0, y: y0, width: w, height: h, scale: Math.min(2, 1280 / w) })).data }, state: await state() };
      }
      case 'file_upload': {
        const ids = (input.document_ids as string[] | undefined) ?? [];
        if (t?.type !== 'ref' || input.paths || ids.length !== 1 || ids[0] !== 'resume') return { ok: false, error: 'Refused: upload only the staged resume (document_ids: ["resume"]) onto a ref.' };
        const file = await d.resume();
        if (!file) return { ok: false, error: 'No resume is available for this application.' };
        const r = await d.send<{ ok: boolean; message: string }>({ op: 'set_file', ref: t.ref, ...file });
        if (!r.ok) return { ok: false, error: r.message };
        await d.sleep(d.quick ? 50 : 1500); // the page may parse the file and fill fields from it
        return { ok: true, text: r.message, state: await state() };
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
