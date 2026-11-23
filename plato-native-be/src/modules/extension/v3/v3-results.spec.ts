import type Anthropic from '@anthropic-ai/sdk';
import { errorCode, OLD_IMAGE, pruneImages, resultContent } from './v3-results';

const tabs = (n = 1) => ({
  tabs: Array.from({ length: n }, (_, i) => ({
    tab_id: `tab_${i + 1}`,
    title: `T${i}`,
    url: `https://x.test/${i}`,
    active: i === 0,
  })),
});

describe('v3 tool_result content (browser toolset rules)', () => {
  it('list_tabs: exactly one browser_state block, no text (the 2026-11-13 400)', () => {
    const { content, isError } = resultContent('list_tabs', {
      call_id: 'c',
      ok: true,
      text: 'Tabs listed',
      state: tabs(2),
    });
    expect(isError).toBe(false);
    expect(content).toHaveLength(1);
    expect((content as unknown as { type: string }[])[0].type).toBe(
      'browser_state',
    );
  });

  it('new_tab: carries exactly one tab_opened for the active tab', () => {
    const state = {
      tabs: [
        { tab_id: 'a', title: '', url: 'u', active: false },
        { tab_id: 'b', title: '', url: 'v', active: true },
      ],
    };
    const [block] = resultContent('new_tab', { call_id: 'c', ok: true, state })
      .content as unknown as { state_changes: unknown[] }[];
    expect(block.state_changes).toEqual([{ type: 'tab_opened', tab_id: 'b' }]);
  });

  it('a tab member with no tab state is an error, not a malformed success', () => {
    expect(
      resultContent('switch_tab', { call_id: 'c', ok: true, text: 'x' })
        .isError,
    ).toBe(true);
  });

  it('screenshot without an image is an error', () => {
    expect(
      resultContent('screenshot', { call_id: 'c', ok: true, state: tabs() })
        .isError,
    ).toBe(true);
  });

  it('browser_state: one active, no duplicate ids, no empty state_changes, no control characters', () => {
    const state = {
      tabs: [
        { tab_id: 'a', title: 'line\nbreak x', url: 'u', active: true },
        { tab_id: 'a', title: 'dup', url: 'u' },
        { tab_id: 'b', title: '', url: 'v', active: true },
      ],
      state_changes: [{ type: 'tab_opened', tab_id: 'missing' }],
    };
    const blocks = resultContent('left_click', {
      call_id: 'c',
      ok: true,
      text: 'Clicked',
      state,
    }).content as unknown as Record<string, unknown>[];
    const bs = blocks.find((b) => b.type === 'browser_state') as {
      tabs: { tab_id: string; title: string; active?: boolean }[];
      state_changes?: unknown;
    };
    expect(bs.tabs.map((t) => t.tab_id)).toEqual(['a', 'b']);
    expect(bs.tabs.filter((t) => t.active)).toHaveLength(1);
    expect(bs.tabs[0].title).toBe('line break x');
    expect(bs.state_changes).toBeUndefined();
  });

  it('an error result has no browser_state', () => {
    const { content, isError } = resultContent('left_click', {
      call_id: 'c',
      ok: false,
      error: 'stale',
      state: tabs(),
    });
    expect(isError).toBe(true);
    expect(content).toEqual([{ type: 'text', text: 'stale' }]);
  });
});

describe('pruneImages: long runs send at most 3 images per request', () => {
  it('a 35-step session: every request carries <= 3 images, the newest ones, and every tool_use keeps its tool_result', () => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    const images = (m: unknown) => (JSON.stringify(m).match(/"type":"image"/g) ?? []).length;
    for (let i = 0; i < 35; i++) {
      messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: `t${i}`, name: 'screenshot', input: {} }] });
      const r = resultContent('screenshot', { call_id: `t${i}`, ok: true, image: { media_type: 'image/jpeg', data: `img${i}` }, state: tabs() });
      messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: r.content }] });
      pruneImages(messages); // what advance() does before each request
      expect(images(messages)).toBe(Math.min(3, i + 1));
    }
    const json = JSON.stringify(messages);
    expect(json).toContain('img34');
    expect(json).toContain('img32');
    expect(json).not.toContain('img31');
    expect((json.match(new RegExp(OLD_IMAGE.replace(/[[\]]/g, '\\$&'), 'g')) ?? []).length).toBe(32);
    for (let i = 0; i < 35; i++) {
      const use = messages[2 * i]!.content as { id: string }[];
      const res = messages[2 * i + 1]!.content as { tool_use_id: string; content: unknown[] }[];
      expect(res[0]!.tool_use_id).toBe(use[0]!.id);
      expect(res[0]!.content.length).toBeGreaterThan(0); // the browser_state stays beside the note
    }
  });
});

it('error codes: PL- and 6 characters without 0, O, 1 or I (what the stop schema and GET /admin/errors accept)', () => {
  const codes = Array.from({ length: 200 }, errorCode);
  for (const c of codes) expect(c).toMatch(/^PL-[A-HJ-NP-Z2-9]{6}$/);
  expect(new Set(codes).size).toBe(200);
});
