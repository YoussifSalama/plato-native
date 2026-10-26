import { describe, expect, it } from 'vitest';
import type { V3Op } from '../src/content/v3-reader';
import { createExecutor, REFUSE_AGAIN, REFUSE_OTHER_SUBMIT, REFUSE_SUBMIT, type ExecDeps } from '../src/v3/executor';

// A fake tab: the content script answers refs by a small table; chrome.debugger calls are recorded.
function tab(o: { submitRef?: string; blockedOnGuard?: boolean; shotFailsFirst?: boolean; resume?: boolean; formInput?: { ok: boolean; message: string; clickPoint?: { x: number; y: number } } } = {}) {
  const cdp: { method: string; params: Record<string, unknown> }[] = [];
  const ops: V3Op[] = [];
  const nav: string[] = [];
  let activated = 0, settled = 0, shots = 0, guardArmed = 0;
  const deps: ExecDeps = {
    send: async <T,>(msg: V3Op): Promise<T> => {
      ops.push(msg);
      switch (msg.op) {
        case 'info': return { url: 'https://jobs.example/apply', title: 'Apply', width: 1280, height: 900 } as T;
        case 'resolve': return (msg.ref === 'ref_gone' ? null : { x: 100, y: 200 }) as T;
        case 'ready': return (msg.ref === 'ref_gone' ? { ok: false, reason: `Unknown or stale ref: ${msg.ref}. Call read_page again for current refs.` } : msg.ref === 'ref_covered' ? { ok: false, reason: 'Not pressed: something covers it: div "We use cookies" (close or answer that first).' } : { ok: true, point: { x: 100, y: 200 } }) as T;
        case 'describe': return (msg.ref === o.submitRef ? { tag: 'BUTTON', type: 'submit', text: 'Submit application', role: '', isSubmit: true } : msg.ref === 'ref_gone' ? null : { tag: 'BUTTON', type: 'button', text: 'Next', role: '', isSubmit: false }) as T;
        case 'guard': guardArmed++; return { ok: true } as T;
        case 'guarded': return { blocked: o.blockedOnGuard ? 1 : 0 } as T;
        case 'read_page': return 'textbox "Name" required [ref_1]\nbutton "Next" [ref_2]' as T;
        case 'find': return `button "Next" [ref_2]` as T;
        case 'page_text': return 'Apply here' as T;
        case 'form_input': return (o.formInput ?? { ok: true, message: 'Set to "x"' }) as T;
        case 'set_file': return { ok: true, message: `Uploaded ${msg.name}` } as T;
        case 'state': return { captcha: false } as T;
      }
    },
    cdp: async (method, params = {}) => {
      cdp.push({ method, params });
      if (method === 'Page.captureScreenshot') {
        shots++;
        if (o.shotFailsFirst && shots === 1) throw new Error('Unable to capture screenshot');
        return { data: 'iVBORw0KGgo=' };
      }
      return {};
    },
    navigate: async (url) => void nav.push(url),
    settle: async () => void settled++,
    activate: async () => void activated++,
    resume: async () => (o.resume === false ? null : { name: 'cv.pdf', mime: 'application/pdf', data: 'JVBERi0=' }),
    sleep: async () => undefined,
    quick: true,
  };
  const ex = createExecutor(deps);
  const run = (name: string, input: Record<string, unknown> = {}, allowed = false) => ex.exec({ call_id: `c-${name}`, name, input }, allowed);
  const clicks = () => cdp.filter((c) => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mousePressed');
  return { ex, run, cdp, ops, nav, clicks, counts: () => ({ activated, settled, shots, guardArmed }) };
}
const ref = (r: string) => ({ target: { type: 'ref', ref: r } });

describe('executor: the Submit gate (code, not prompt)', () => {
  it('refuses a press on the Submit control until the backend allowed it; nothing reaches the page', async () => {
    const t = tab({ submitRef: 'ref_s' });
    const r = await t.run('left_click', ref('ref_s'), false);
    expect(r).toEqual({ call_id: 'c-left_click', ok: false, error: REFUSE_SUBMIT });
    expect(t.clicks()).toEqual([]);
    expect(t.ex.submitPressed()).toBe(false);
  });
  it('allowed: presses once with real mouse events, reports the press as Submit, then refuses a second press for good', async () => {
    const t = tab({ submitRef: 'ref_s' });
    const r = await t.run('left_click', ref('ref_s'), true);
    expect(r).toMatchObject({ ok: true, text: 'Clicked "Submit application" (Submit)' });
    expect(t.clicks().length).toBe(1);
    expect(t.ex.submitPressed()).toBe(true);
    expect(await t.run('left_click', ref('ref_s'), true)).toMatchObject({ ok: false, error: REFUSE_AGAIN });
    expect(t.clicks().length).toBe(1);
  });
  it('a coordinate click is gated the same way (what is under the point is asked first)', async () => {
    const t = tab({ submitRef: 'ref_s' });
    // the fake answers "Next" for any coordinate: an ordinary press, allowed under the page guard
    const r = await t.run('left_click', { target: { type: 'coordinate', x: 10, y: 20 } }, false);
    expect(r.ok).toBe(true);
    expect(t.ops.some((o) => o.op === 'describe' && 'x' in o && o.x === 10)).toBe(true);
    expect(t.counts().guardArmed).toBe(1);
  });
  it('the page guard: a press or key while Submit is not allowed runs with form submission cancelled; a cancelled submit is reported as a refusal', async () => {
    const t = tab({ blockedOnGuard: true });
    const r = await t.run('left_click', ref('ref_2'), false);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/would have submitted the form; it was cancelled/);
    expect(t.clicks().length).toBe(1); // the press itself happened; the submission did not
    const k = await t.run('key', { text: 'Return' }, false);
    expect(k.ok).toBe(false);
    expect(t.counts().guardArmed).toBe(2);
  });
  it('the allowed Submit press itself runs without the guard (it must go through)', async () => {
    const t = tab({ submitRef: 'ref_s', blockedOnGuard: true });
    const r = await t.run('left_click', ref('ref_s'), true);
    expect(r.ok).toBe(true);
    expect(t.counts().guardArmed).toBe(0);
  });
  it('once allowed, any other press or key is still guarded: an Enter in a field cannot send the form instead of Submit', async () => {
    const t = tab({ submitRef: 'ref_s', blockedOnGuard: true });
    const enter = await t.run('key', { text: 'Enter' }, true);
    expect(enter).toMatchObject({ ok: false, error: REFUSE_OTHER_SUBMIT });
    expect(t.counts().guardArmed).toBe(1);
    expect(t.ex.submitPressed()).toBe(false);
    // the Submit control itself is still there for its one press
    expect(await t.run('left_click', ref('ref_s'), true)).toMatchObject({ ok: true, text: 'Clicked "Submit application" (Submit)' });
  });
  it('after the one Submit press, a later Enter or another submitting control in the same turn cannot send it again', async () => {
    const t = tab({ submitRef: 'ref_s', blockedOnGuard: true });
    await t.run('left_click', ref('ref_s'), true);
    const enter = await t.run('key', { text: 'Enter' }, true);
    expect(enter.ok).toBe(false);
    expect(enter.error).toContain(REFUSE_AGAIN);
    const other = await t.run('left_click', ref('ref_2'), true);
    expect(other.ok).toBe(false);
    expect(t.counts().guardArmed).toBe(2);
  });
  it('an ordinary press after Submit is allowed still works when it does not submit (Next, a checkbox)', async () => {
    const t = tab({ submitRef: 'ref_s' });
    expect(await t.run('left_click', ref('ref_2'), true)).toMatchObject({ ok: true });
    expect(await t.run('key', { text: 'Tab' }, true)).toMatchObject({ ok: true });
  });
});

describe('executor: a person\'s pace (the reliability layer)', () => {
  it('a press rests on the control first, then presses and releases, then lets the page settle', async () => {
    const t = tab();
    await t.run('left_click', ref('ref_2'), false);
    const mouse = t.cdp.filter((c) => c.method === 'Input.dispatchMouseEvent').map((c) => c.params.type);
    expect(mouse).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased']);
    expect(t.counts().settled).toBeGreaterThan(0);
  });
  it('a control that is covered is never pressed; the model hears what covers it', async () => {
    const t = tab();
    const r = await t.run('left_click', ref('ref_covered'), false);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('something covers it') });
    expect(t.clicks()).toEqual([]);
  });
  it('typing and a changed value both wait for the page (suggestions, revealed fields) before the next look', async () => {
    const t = tab();
    await t.run('type', { text: 'Cairo' });
    const afterType = t.counts().settled;
    expect(afterType).toBe(1);
    await t.run('form_input', { ...ref('ref_1'), value: 'Egypt' });
    expect(t.counts().settled).toBe(afterType + 1);
    expect(t.cdp.filter((c) => c.method === 'Input.insertText').map((c) => c.params.text).join('')).toBe('Cairo');
  });
});

describe('executor: members', () => {
  it('every successful result carries the one-tab browser state', async () => {
    const t = tab();
    for (const [name, input] of [['read_page', { filter: 'interactive' }], ['find', { query: 'next' }], ['get_page_text', {}], ['scroll_to', ref('ref_1')], ['wait', { duration: 1 }], ['list_tabs', {}], ['navigate', { url: 'https://jobs.example/apply' }]] as const) {
      const r = await t.run(name, input as Record<string, unknown>);
      expect(r.ok, name).toBe(true);
      expect(r.state?.tabs, name).toEqual([{ tab_id: 'tab_1', title: 'Apply', url: 'https://jobs.example/apply', active: true }]);
    }
    expect(t.nav).toEqual(['https://jobs.example/apply']);
    expect(t.counts().settled).toBe(1); // wait settles the page
  });
  it('type inserts text through CDP; key presses chords with modifiers', async () => {
    const t = tab();
    await t.run('type', { text: 'Cairo' });
    expect(t.cdp.filter((c) => c.method === 'Input.insertText').map((c) => c.params.text).join('')).toBe('Cairo');
    await t.run('key', { text: 'ctrl+a Backspace' }, true);
    const keys = t.cdp.filter((c) => c.method === 'Input.dispatchKeyEvent').map((c) => `${c.params.type}:${c.params.key}:${c.params.modifiers}`);
    expect(keys).toEqual(['rawKeyDown:a:2', 'keyUp:a:2', 'rawKeyDown:Backspace:0', 'keyUp:Backspace:0']);
  });
  it('form_input: a box comes back with a point and gets a real click; a refused value is the model’s error', async () => {
    const box = tab({ formInput: { ok: true, message: 'Checked', clickPoint: { x: 5, y: 6 } } });
    expect(await box.run('form_input', { ...ref('ref_7'), value: true })).toMatchObject({ ok: true, text: 'Checked' });
    expect(box.clicks().map((c) => [c.params.x, c.params.y])).toEqual([[5, 6]]);
    const bad = tab({ formInput: { ok: false, message: 'No option matches "Mars"' } });
    expect(await bad.run('form_input', { ...ref('ref_5'), value: 'Mars' })).toMatchObject({ ok: false, error: 'No option matches "Mars"' });
  });
  it('a stale ref is an error the model can act on', async () => {
    const t = tab();
    const r = await t.run('left_click', ref('ref_gone'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Unknown or stale ref: ref_gone/);
  });
  it('file_upload takes only the staged resume onto a ref', async () => {
    const t = tab();
    expect((await t.run('file_upload', { ...ref('ref_6'), paths: ['/etc/passwd'] })).error).toMatch(/only the staged resume/);
    expect((await t.run('file_upload', { ...ref('ref_6'), document_ids: ['cover'] })).error).toMatch(/only the staged resume/);
    expect(await t.run('file_upload', { ...ref('ref_6'), document_ids: ['resume'] })).toMatchObject({ ok: true, text: 'Uploaded cv.pdf' });
    expect(t.ops.find((o) => o.op === 'set_file')).toMatchObject({ ref: 'ref_6', name: 'cv.pdf', data: 'JVBERi0=' });
    const none = tab({ resume: false });
    expect((await none.run('file_upload', { ...ref('ref_6'), document_ids: ['resume'] })).error).toMatch(/No resume/);
  });
  it('screenshot: a tab Chrome did not paint is brought forward once and captured again; zoom clips', async () => {
    const t = tab({ shotFailsFirst: true });
    const r = await t.run('screenshot');
    expect(r).toMatchObject({ ok: true, image: { media_type: 'image/png', data: 'iVBORw0KGgo=' } });
    expect(t.counts()).toMatchObject({ activated: 1, shots: 2 });
    await t.run('zoom', { region: [100, 200, 740, 600] });
    expect(t.cdp.at(-1)?.params.clip).toEqual({ x: 100, y: 200, width: 640, height: 400, scale: 2 });
  });
  it('members this browser does not serve are refused, never thrown', async () => {
    const t = tab();
    expect(await t.run('new_tab', { url: 'https://x' })).toEqual({ call_id: 'c-new_tab', ok: false, error: 'new_tab is not available in this browser.' });
    expect(await t.run('javascript_exec', { code: '1' })).toMatchObject({ ok: false });
    expect((await t.run('wait', { duration: 99 })).error).toMatch(/between 0 and 30/);
  });
});
