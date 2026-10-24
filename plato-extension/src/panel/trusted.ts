import type { FillInstruction, FillResult } from '../dom/types';
import { COMBO_OPTIONS, COMBO_VERIFY, DOM_POINT, GROUP_STATE } from '../core/messages';

// Trusted input: real mouse and key events through the Chrome DevTools Protocol (chrome.debugger),
// the same events a person's hand produces. Custom dropdowns, boxes and buttons accept them where
// page-side synthetic events are ignored. The content script only answers where things are and
// what they show. Pure over its deps so the flows can be tested without a browser.
export interface Point {
  x: number;
  y: number;
}
export interface TrustedDeps {
  attach(tabId: number): Promise<boolean>; // false: another debugger holds the tab (DevTools open): fall back
  detach(tabId: number): Promise<void>;
  cdp(tabId: number, method: string, params?: Record<string, unknown>): Promise<unknown>;
  send<T>(tabId: number, msg: unknown): Promise<T>;
  sleep(ms: number): Promise<void>;
}
export const TRUSTED_KINDS = new Set(['combobox', 'checkbox', 'radio', 'checkbox-group', 'richtext']);
const KEYS: Record<string, { code: string; vk: number; text?: string }> = { Enter: { code: 'Enter', vk: 13, text: '\r' }, ArrowDown: { code: 'ArrowDown', vk: 40 }, Escape: { code: 'Escape', vk: 27 }, Tab: { code: 'Tab', vk: 9 } };
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const failed = (fieldId: string, reason: string, shown?: string): FillResult => ({ fieldId, status: 'failed', reason, ...(shown !== undefined && { shown }) });

export function createTrusted(d: TrustedDeps) {
  const attached = new Set<number>();
  const attach = async (tabId: number) => {
    if (attached.has(tabId)) return true;
    const ok = await d.attach(tabId).catch(() => false);
    if (ok) attached.add(tabId);
    return ok;
  };
  const detach = async (tabId: number) => {
    if (!attached.delete(tabId)) return;
    await d.detach(tabId).catch(() => undefined);
  };
  // The runtime-test build moves fast; real builds at human pace.
  const slow = (ms: number) => d.sleep(typeof __FLAVOR__ !== 'undefined' && __FLAVOR__ === 'fixtures' ? Math.min(ms, 5) : ms);
  // A person's click: press, hold, release at the point. No CDP mouse moves: in a background tab each move waits for
  // the next frame (about 1 s; measured), so a glide of moves made one click take ~10 s. The visible glide is the page
  // cursor's (content/overlay.ts), shown while the point is found (DOM_POINT), and costs nothing.
  const click = async (tabId: number, p: Point) => {
    await slow(120);
    await d.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await slow(70);
    await d.cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  };
  const key = async (tabId: number, name: keyof typeof KEYS) => {
    const k = KEYS[name]!;
    await d.cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, ...(k.text && { text: k.text }) });
    await d.cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
  };
  // Typing at a person's pace: characters for short text, words for long text (a cover letter stays quick).
  const type = async (tabId: number, text: string) => {
    const pieces = text.length > 60 ? text.match(/\S+\s*/g) ?? [text] : [...text];
    for (const piece of pieces.slice(0, 120)) {
      await d.cdp(tabId, 'Input.insertText', { text: piece });
      await slow(text.length > 60 ? 55 : 40);
    }
    const rest = pieces.slice(120).join('');
    if (rest) await d.cdp(tabId, 'Input.insertText', { text: rest });
  };

  type PointReply = { point: Point | null; kind?: string; error?: string } | null;
  type GroupReply = { options: { value: string; checked: boolean; point: Point | null }[]; vh?: string; error?: string } | null;

  // A box list: press every box whose state must change, then read the group back.
  async function fillGroup(tabId: number, formId: string, ins: FillInstruction): Promise<FillResult> {
    const want = (v: string) => (Array.isArray(ins.value) ? ins.value.includes(v) : typeof ins.value === 'boolean' ? ins.value : ins.value === v);
    const st = await d.send<GroupReply>(tabId, { type: GROUP_STATE, formId, fieldId: ins.fieldId });
    if (!st || st.error) return failed(ins.fieldId, st?.error ?? 'no-such-field');
    if (typeof ins.value === 'string' && !Array.isArray(ins.value) && ins.kind !== 'checkbox' && !st.options.some((o) => o.value === ins.value)) return failed(ins.fieldId, 'no-option');
    for (const o of st.options) {
      const target = ins.kind === 'radio' ? o.value === ins.value && !o.checked : ins.kind === 'checkbox' ? o.checked !== (ins.value === true) : o.checked !== want(o.value);
      if (!target) continue;
      if (!o.point) return failed(ins.fieldId, 'not-fillable');
      await click(tabId, o.point);
      await d.sleep(260);
    }
    const after = await d.send<GroupReply>(tabId, { type: GROUP_STATE, formId, fieldId: ins.fieldId });
    if (!after || after.error) return failed(ins.fieldId, after?.error ?? 'no-such-field');
    const ok = ins.kind === 'checkbox' ? after.options[0]?.checked === (ins.value === true) : after.options.every((o) => o.checked === (ins.kind === 'radio' ? o.value === ins.value : want(o.value)));
    const shown = after.options.filter((o) => o.checked).map((o) => o.value).join(' | ');
    return ok ? { fieldId: ins.fieldId, status: 'filled', shown, vh: after.vh } : failed(ins.fieldId, 'value-mismatch', shown);
  }

  // A rich-text editor (contenteditable): click into it, type with real key input. The read-back after the fill proves it.
  async function fillRich(tabId: number, formId: string, ins: FillInstruction): Promise<FillResult> {
    const at = await d.send<PointReply>(tabId, { type: DOM_POINT, what: 'field', formId, fieldId: ins.fieldId, fp: ins.fp });
    if (!at || at.error || !at.point || typeof ins.value !== 'string') return failed(ins.fieldId, at?.error ?? 'not-fillable');
    await click(tabId, at.point);
    await d.sleep(120);
    await type(tabId, ins.value);
    await d.sleep(150);
    return { fieldId: ins.fieldId, status: 'filled', shown: ins.value.slice(0, 80) };
  }

  // A combobox: open it with a real press, read its own list, press the option, prove the pick.
  async function fillCombobox(tabId: number, formId: string, ins: FillInstruction): Promise<FillResult> {
    const value = String(ins.value);
    const want = norm(value);
    const at = await d.send<PointReply>(tabId, { type: DOM_POINT, what: 'field', formId, fieldId: ins.fieldId, fp: ins.fp });
    if (!at || at.error || !at.point) return failed(ins.fieldId, at?.error ?? 'not-fillable');
    const options = async () => (await d.send<{ options: string[] } | null>(tabId, { type: COMBO_OPTIONS, formId, fieldId: ins.fieldId }))?.options ?? [];
    await click(tabId, at.point);
    await d.sleep(350);
    let opts = await options();
    if (!opts.length) {
      await type(tabId, value); // a searchable list that opens on typing
      await d.sleep(450);
      opts = await options();
    } else if (opts.length > 12) {
      await type(tabId, value); // a long list (countries): narrow it
      await d.sleep(350);
      opts = await options();
    }
    if (!opts.length) {
      await key(tabId, 'Escape');
      return failed(ins.fieldId, 'no-option', 'the list did not open');
    }
    const pick = opts.find((o) => norm(o) === want) ?? opts.find((o) => norm(o).startsWith(want) || norm(o).includes(want) || want.includes(norm(o))) ?? (opts.length === 1 ? opts[0] : undefined);
    if (!pick) {
      await key(tabId, 'Escape');
      return failed(ins.fieldId, 'no-option', opts.slice(0, 8).join(' | '));
    }
    const verify = async () => d.send<{ ok: boolean; shown: string; vh?: string } | null>(tabId, { type: COMBO_VERIFY, formId, fieldId: ins.fieldId, chosen: pick });
    const op = await d.send<Point | null>(tabId, { type: DOM_POINT, what: 'option', formId, fieldId: ins.fieldId, text: pick });
    if (op) {
      await click(tabId, op);
      await d.sleep(250);
      const v = await verify();
      if (v?.ok) return { fieldId: ins.fieldId, status: 'filled', shown: pick, vh: v.vh };
    }
    // the press did not take: keyboard. Walk to the option, Enter.
    const index = Math.max(0, opts.findIndex((o) => o === pick));
    for (let i = 0; i <= index && i < 60; i++) {
      await key(tabId, 'ArrowDown');
      await d.sleep(40);
    }
    await key(tabId, 'Enter');
    await d.sleep(250);
    const v = await verify();
    if (v?.ok) return { fieldId: ins.fieldId, status: 'filled', shown: pick, vh: v.vh };
    await key(tabId, 'Escape');
    return failed(ins.fieldId, 'value-mismatch', v?.shown);
  }

  return {
    attach,
    detach,
    isAttached: (tabId: number) => attached.has(tabId),
    /** The trusted-kind instructions of one fill round. */
    async fill(tabId: number, formId: string, instructions: FillInstruction[]): Promise<FillResult[]> {
      const out: FillResult[] = [];
      for (const ins of instructions) {
        out.push(ins.kind === 'combobox' ? await fillCombobox(tabId, formId, ins) : ins.kind === 'richtext' ? await fillRich(tabId, formId, ins) : await fillGroup(tabId, formId, ins));
        await slow(450); // a breath before the next field
      }
      return out;
    },
    /** What each combobox offers: open, read, close. */
    async probe(tabId: number, formId: string, fields: { id: string; fp: string }[]) {
      const out: { fieldId: string; options: { value: string; label: string }[]; total: number }[] = [];
      for (const f of fields) {
        const at = await d.send<PointReply>(tabId, { type: DOM_POINT, what: 'field', formId, fieldId: f.id, fp: f.fp });
        if (!at?.point) continue;
        await click(tabId, at.point);
        await d.sleep(350);
        const opts = (await d.send<{ options: string[] } | null>(tabId, { type: COMBO_OPTIONS, formId, fieldId: f.id }))?.options ?? [];
        await key(tabId, 'Escape');
        await d.sleep(80);
        out.push({ fieldId: f.id, options: opts.length <= 60 ? opts.map((l) => ({ value: l, label: l })) : [], total: opts.length });
      }
      return out;
    },
    /** Press a control the planner named. */
    async pressRef(tabId: number, ref: string): Promise<{ clicked: boolean }> {
      const p = await d.send<Point | null>(tabId, { type: DOM_POINT, what: 'ref', ref });
      if (!p) return { clicked: false };
      await click(tabId, p);
      return { clicked: true };
    },
  };
}
export type Trusted = ReturnType<typeof createTrusted>;
