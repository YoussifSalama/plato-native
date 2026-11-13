import { resultContent } from './v3-results';

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
