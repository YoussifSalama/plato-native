import { describe, expect, it } from 'vitest';
import { COMBO_OPTIONS, COMBO_VERIFY, DOM_POINT, GROUP_STATE } from '../src/core/messages';
import { createTrusted } from '../src/panel/trusted';

// A fake page: a react-select-like box that opens on a real press at its point, lists its options,
// and shows the pick in its own box; checkboxes and radios that toggle on a press at their point.
function page(o: { options?: string[]; openOnPress?: boolean; openOnType?: boolean; pickOnPress?: boolean; pickOnEnter?: boolean } = {}) {
  const opts = o.options ?? ['Yes', 'No'];
  const st = { open: false, typed: '', chosen: '', focused: -1, boxes: { a: false, b: false, c: false }, radio: '' as string, clicks: [] as [number, number][], keys: [] as string[], attached: 0 };
  const optionPoint = (text: string) => ({ x: 200, y: 400 + opts.indexOf(text) * 20 });
  const deps = {
    attach: async () => {
      st.attached++;
      return true;
    },
    detach: async () => undefined,
    cdp: async (_t: number, method: string, p: Record<string, unknown> = {}) => {
      if (method === 'Input.dispatchMouseEvent' && p.type === 'mousePressed') {
        const x = p.x as number, y = p.y as number;
        st.clicks.push([x, y]);
        if (x === 100 && y === 100 && (o.openOnPress ?? true)) st.open = true; // the combobox
        const hit = opts.find((t) => optionPoint(t).y === y && x === 200);
        if (st.open && hit && (o.pickOnPress ?? true)) {
          st.chosen = hit;
          st.open = false;
        }
        if (y === 600) st.boxes.a = !st.boxes.a; // checkbox a
        if (y === 620) st.boxes.b = !st.boxes.b;
        if (y === 640) st.boxes.c = !st.boxes.c;
        if (y === 700) st.radio = 'yes';
        if (y === 720) st.radio = 'no';
      }
      if (method === 'Input.insertText') {
        st.typed += p.text as string;
        if (o.openOnType) st.open = true;
      }
      if (method === 'Input.dispatchKeyEvent' && p.type === 'keyDown') {
        st.keys.push(p.key as string);
        if (p.key === 'ArrowDown' && st.open) st.focused++;
        if (p.key === 'Enter' && st.open && o.pickOnEnter) {
          const shown = opts.filter((t) => !st.typed || t.toLowerCase().startsWith(st.typed.toLowerCase())); // the focused option is among the filtered ones
          st.chosen = shown[Math.max(0, st.focused)]!;
          st.open = false;
        }
        if (p.key === 'Escape') st.open = false;
      }
    },
    send: async <T,>(_t: number, m: unknown): Promise<T> => {
      const msg = m as { type: string; what?: string; fieldId: string; text?: string; chosen?: string };
      const visible = () => (st.open ? opts.filter((t) => !st.typed || t.toLowerCase().startsWith(st.typed.toLowerCase())) : []);
      if (msg.type === DOM_POINT && msg.what === 'field') return { point: msg.fieldId === 'combo' ? { x: 100, y: 100 } : { x: 0, y: 0 }, kind: msg.fieldId } as T;
      if (msg.type === DOM_POINT && msg.what === 'option') return (visible().includes(msg.text!) ? optionPoint(msg.text!) : null) as T;
      if (msg.type === COMBO_OPTIONS) return { options: visible() } as T;
      if (msg.type === COMBO_VERIFY) return { ok: st.chosen === msg.chosen, shown: st.chosen, vh: 'vh2' } as T;
      if (msg.type === GROUP_STATE) {
        if (msg.fieldId === 'cb') return { options: [{ value: 'on', checked: st.boxes.a, point: { x: 10, y: 600 } }], vh: 'vh3' } as T;
        if (msg.fieldId === 'grp') return { options: [{ value: 'a', checked: st.boxes.a, point: { x: 10, y: 600 } }, { value: 'b', checked: st.boxes.b, point: { x: 10, y: 620 } }, { value: 'c', checked: st.boxes.c, point: { x: 10, y: 640 } }], vh: 'vh4' } as T;
        if (msg.fieldId === 'radio') return { options: [{ value: 'yes', checked: st.radio === 'yes', point: { x: 10, y: 700 } }, { value: 'no', checked: st.radio === 'no', point: { x: 10, y: 720 } }], vh: 'vh5' } as T;
      }
      return null as T;
    },
    sleep: async () => undefined,
  };
  return { st, t: createTrusted(deps) };
}
const ins = (fieldId: string, kind: string, value: unknown) => ({ fieldId, fp: 'fp', vh: 'vh', value: value as never, kind: kind as never });

describe('trusted input', () => {
  it('combobox: a real press opens it, its option is pressed, the pick is proven on the widget', async () => {
    const { st, t } = page();
    await t.attach(1);
    const [r] = await t.fill(1, 'form1', [ins('combo', 'combobox', 'yes')]);
    expect(r).toMatchObject({ status: 'filled', shown: 'Yes', vh: 'vh2' });
    expect(st.chosen).toBe('Yes');
    expect(st.open).toBe(false);
  });

  it('combobox that opens only on typing, then the pick needs the keyboard', async () => {
    const { st, t } = page({ openOnPress: false, openOnType: true, pickOnPress: false, pickOnEnter: true });
    await t.attach(1);
    const [r] = await t.fill(1, 'form1', [ins('combo', 'combobox', 'No')]);
    expect(r).toMatchObject({ status: 'filled', shown: 'No' });
    expect(st.typed).toBe('No');
    expect(st.keys.filter((k) => k === 'ArrowDown').length).toBeGreaterThan(0);
    expect(st.keys.at(-1)).toBe('Enter');
  });

  it('combobox: a value the list does not offer fails with what was offered, and the list is closed', async () => {
    const { st, t } = page();
    await t.attach(1);
    const [r] = await t.fill(1, 'form1', [ins('combo', 'combobox', 'Maybe')]);
    expect(r).toMatchObject({ status: 'failed', reason: 'no-option', shown: 'Yes | No' });
    expect(st.keys.at(-1)).toBe('Escape');
    expect(st.open).toBe(false);
  });

  it('checkbox, radio and tick list: presses only what must change, then reads the group back', async () => {
    const { st, t } = page();
    await t.attach(1);
    st.boxes.b = true; // already ticked: must come off for ['a','c']
    const out = await t.fill(1, 'form1', [ins('cb', 'checkbox', true), ins('radio', 'radio', 'no'), ins('grp', 'checkbox-group', ['a', 'c'])]);
    expect(out.map((r) => [r.status, r.shown])).toEqual([['filled', 'on'], ['filled', 'no'], ['filled', 'a | c']]);
    expect(st.boxes).toEqual({ a: true, b: false, c: true }); // 'a' was pressed once (by cb), not toggled back by the group
    expect(st.radio).toBe('no');
  });

  it('probe: opens each combobox, reads its list, closes it', async () => {
    const { st, t } = page();
    await t.attach(1);
    const out = await t.probe(1, 'form1', [{ id: 'combo', fp: 'fp' }]);
    expect(out).toEqual([{ fieldId: 'combo', options: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }], total: 2 }]);
    expect(st.open).toBe(false);
  });

  it('attach fails (DevTools holds the tab): reported, so the page-side path is used instead', async () => {
    const t = createTrusted({ attach: async () => { throw new Error('Another debugger is already attached'); }, detach: async () => undefined, cdp: async () => undefined, send: async <T,>() => null as T, sleep: async () => undefined });
    expect(await t.attach(1)).toBe(false);
    expect(t.isAttached(1)).toBe(false);
  });
});
