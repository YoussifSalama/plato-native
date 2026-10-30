import { z } from 'zod';

// Engine v3 wire contract between the backend (the brain: it talks to Claude) and the extension (the executor: it
// runs each browser action in the seeker's own browser). One HTTP exchange per model turn:
//   POST /extension/v1/items/:id/v3/turn  { event, results?, text? }  ->  { calls } | { outcome }
// The call/result shapes mirror Anthropic's browser use tool members, so the executor is a plain driver.

export const V3_CONTRACT_VERSION = 1;

/** The page an application starts on: apply_url when the job has one, else the listing. Board jobs (LinkedIn) store apply_url as '' (not null); `??` kept it and `new URL('')` threw (2026-10-30). */
export const applyPageOf = (job: { apply_url?: string | null; url: string }): string => job.apply_url || job.url;

export const callResultSchema = z.object({
  call_id: z.string().min(1).max(64),
  ok: z.boolean(),
  // what the member returned, as the tool contract renders it (text for most members, image for screenshot/zoom)
  text: z.string().max(60_000).optional(),
  image: z.object({ media_type: z.enum(['image/png', 'image/jpeg', 'image/webp']), data: z.string().max(6_000_000) }).optional(),
  // the open tabs after the call (exactly one active) and what changed; omitted on an error
  state: z
    .object({
      tabs: z.array(z.object({ tab_id: z.string().max(64), title: z.string().max(4096), url: z.string().max(4096), active: z.boolean().optional() })).max(100),
      state_changes: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    })
    .optional(),
  error: z.string().max(600).optional(),
});
export type CallResult = z.infer<typeof callResultSchema>;

export const turnRequestSchema = z.object({
  // start: open the conversation. results: the previous turn's calls were run. seeker_answer: the seeker answered an ASK.
  // solved: the seeker cleared a human check. submit: the item is armed, the model may press Submit once.
  event: z.enum(['start', 'results', 'seeker_answer', 'solved', 'submit', 'check']),
  results: z.array(callResultSchema).max(64).optional(),
  text: z.string().max(2000).optional(),
});
export type TurnRequest = z.infer<typeof turnRequestSchema>;

export interface BrowserCall {
  call_id: string;
  name: string; // member name: navigate, read_page, left_click, type, form_input, file_upload, screenshot, ...
  input: Record<string, unknown>;
}

export type Outcome =
  | { kind: 'submit_ready'; summary: string }
  | { kind: 'ask'; question: string }
  | { kind: 'captcha'; text: string }
  | { kind: 'closed'; reason: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'confirmed'; quote: string }
  | { kind: 'refused'; quote: string }
  | { kind: 'unconfirmed'; text: string }
  | { kind: 'error'; message: string };

export type TurnResponse =
  | { version: 1; turn: number; calls: BrowserCall[]; submit_allowed: boolean }
  | { version: 1; turn: number; outcome: Outcome };

const KEYWORD = /^(?:(?:SUBMIT_READY|UNCONFIRMED|CONFIRMED|REFUSED|CAPTCHA|CLOSED|BLOCKED)\b|ASK\s*:)/i;

/** The model's final text, mapped to an outcome the state machine understands. The keyword may follow a sentence
 * of its own ("All fields hold a value.\nSUBMIT_READY …"): the LAST line that starts with one is the answer. */
export function parseOutcome(text: string): Outcome {
  const lines = text.trim().split('\n');
  const at = lines.findLastIndex((l) => KEYWORD.test(l.trim()));
  const t = (at >= 0 ? lines.slice(at).join('\n') : text).trim();
  const m = (re: RegExp) => re.exec(t)?.[1]?.trim() ?? '';
  if (/^SUBMIT_READY\b/i.test(t)) return { kind: 'submit_ready', summary: m(/^SUBMIT_READY[:\s\-—–]*([\s\S]*)$/i).slice(0, 400) };
  if (/^CONFIRMED\b/i.test(t)) return { kind: 'confirmed', quote: m(/^CONFIRMED[:\s\-—–]*([\s\S]*)$/i).slice(0, 300) };
  if (/^REFUSED\b/i.test(t)) return { kind: 'refused', quote: m(/^REFUSED[:\s\-—–]*([\s\S]*)$/i).slice(0, 300) };
  if (/^UNCONFIRMED\b/i.test(t)) return { kind: 'unconfirmed', text: t.slice(0, 300) };
  if (/^CAPTCHA\b/i.test(t)) return { kind: 'captcha', text: t.slice(0, 300) };
  if (/^ASK\s*:/i.test(t)) return { kind: 'ask', question: m(/^ASK\s*:\s*([\s\S]*)$/i).slice(0, 400) };
  if (/^CLOSED\b/i.test(t)) return { kind: 'closed', reason: m(/^CLOSED[:\s\-—–]*([\s\S]*)$/i).slice(0, 300) };
  if (/^BLOCKED\b/i.test(t)) return { kind: 'blocked', reason: m(/^BLOCKED[:\s\-—–]*([\s\S]*)$/i).slice(0, 300) };
  // no keyword: the model stopped talking; treat as blocked with its words, never as success
  return { kind: 'blocked', reason: (t || 'The model ended without a result.').slice(0, 300) };
}
