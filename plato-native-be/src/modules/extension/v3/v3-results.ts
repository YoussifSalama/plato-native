import type Anthropic from '@anthropic-ai/sdk';
import type { CallResult } from './v3-contract';

// The browser toolset's rules for a member's tool_result (the API rejects the whole request otherwise):
//   - new_tab / switch_tab / close_tab / list_tabs: content is exactly one browser_state block;
//     new_tab's carries exactly one tab_opened, for the active tab;
//   - screenshot / zoom: an image block;
//   - browser_state at most once, never on an error, tabs non-empty => exactly one active, no duplicate
//     tab_id, no empty state_changes, every tab_opened names a listed tab, no control characters.
// https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool

type Block = Anthropic.Beta.BetaToolResultBlockParam['content'];
export const TAB_MEMBERS = new Set([
  'new_tab',
  'switch_tab',
  'close_tab',
  'list_tabs',
]);
const IMAGE_MEMBERS = new Set(['screenshot', 'zoom']);

// control characters (C0, C1) and Unicode line/paragraph separators: stripping them is the point
/* eslint-disable no-control-regex */
const CONTROL = new RegExp(
  '[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+',
  'g',
);
/* eslint-enable no-control-regex */
const clean = (s: string) => s.replace(CONTROL, ' ').slice(0, 4096);

export function browserState(
  state: NonNullable<CallResult['state']>,
  member: string,
) {
  const seen = new Set<string>();
  const tabs = state.tabs
    .filter((t) => t.tab_id && !seen.has(t.tab_id) && seen.add(t.tab_id))
    .map((t) => ({
      tab_id: clean(t.tab_id),
      title: clean(t.title),
      url: clean(t.url),
      active: !!t.active,
    }));
  // exactly one active: the first one the executor marked, else the first tab
  const first = Math.max(
    0,
    tabs.findIndex((t) => t.active),
  );
  const listed = tabs.map((t, i) => ({
    tab_id: t.tab_id,
    title: t.title,
    url: t.url,
    ...(i === first && { active: true }),
  }));
  const ids = new Set(listed.map((t) => t.tab_id));
  let changes = (state.state_changes ?? []).filter(
    (c) => c.type !== 'tab_opened' || ids.has(String(c.tab_id)),
  );
  if (member === 'new_tab') {
    const active = listed[first]?.tab_id;
    changes = [
      ...changes.filter((c) => c.type !== 'tab_opened'),
      ...(active ? [{ type: 'tab_opened', tab_id: active }] : []),
    ];
  }
  return {
    type: 'browser_state',
    tabs: listed,
    ...(changes.length && { state_changes: changes }),
  };
}

/** One member's tool_result content, or an error text when a successful result can't be shaped the way the API requires. */
export function resultContent(
  member: string,
  r: CallResult,
): { content: Block; isError: boolean } {
  if (!r.ok)
    return {
      content: [{ type: 'text', text: r.error ?? 'The action failed.' }],
      isError: true,
    };
  const state = r.state ? browserState(r.state, member) : null;
  if (TAB_MEMBERS.has(member)) {
    if (!state?.tabs.length)
      return {
        content: [
          { type: 'text', text: `${member}: the browser reported no tabs.` },
        ],
        isError: true,
      };
    return { content: [state] as unknown as Block, isError: false };
  }
  if (IMAGE_MEMBERS.has(member) && !r.image)
    return {
      content: [
        {
          type: 'text',
          text: `${member}: no image was captured. Try again or use read_page.`,
        },
      ],
      isError: true,
    };
  const content: unknown[] = [];
  if (r.image)
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: r.image.media_type,
        data: r.image.data,
      },
    });
  if (r.text !== undefined)
    content.push({ type: 'text', text: r.text || '(empty)' });
  if (!r.image && r.text === undefined)
    content.push({ type: 'text', text: `${member}: done` });
  if (state) content.push(state);
  return { content: content as Block, isError: false };
}
