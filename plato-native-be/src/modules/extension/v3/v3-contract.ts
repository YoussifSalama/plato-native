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
  text: z.string().max(4000).optional(),
  // seeker_answer: the structured answers behind `text` (one per question the brain asked), when the panel's form collected them
  answers: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(300), value: z.string().max(2000) })).max(20).optional(),
});
export type TurnRequest = z.infer<typeof turnRequestSchema>;

export interface BrowserCall {
  call_id: string;
  name: string; // member name: navigate, read_page, left_click, type, form_input, file_upload, screenshot, ...
  input: Record<string, unknown>;
}

// A question the brain cannot answer from the profile, shaped so the panel can draw the right control instead of a
// text box: Yes/No pills, a choice list, several picks, a short value, or a sentence. The brain asks them all at once.
export const askQuestionSchema = z.object({
  id: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/i),
  label: z.string().min(1).max(300), // a complete question the seeker can answer without seeing the page
  type: z.enum(['boolean', 'choice', 'multi', 'text', 'textarea']),
  options: z.array(z.string().min(1).max(120)).max(20).optional(),
  other: z.boolean().optional(), // "Something else" with a free text box, beside the options
  why: z.string().max(300).optional(), // the form field behind it and the fact the profile lacks
  required: z.boolean().optional(), // default true
});
export type AskQuestion = z.infer<typeof askQuestionSchema>;
export const askSchema = z.object({ questions: z.array(askQuestionSchema).min(1).max(8) });

export type Outcome =
  | { kind: 'submit_ready'; summary: string }
  | { kind: 'ask'; question: string; questions: AskQuestion[] } // question: the one-line summary; questions: what the panel draws
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
  if (/^ASK\s*:/i.test(t)) return parseAsk(m(/^ASK\s*:\s*([\s\S]*)$/i));
  if (/^CLOSED\b/i.test(t)) return { kind: 'closed', reason: m(/^CLOSED[:\s\-—–]*([\s\S]*)$/i).slice(0, 300) };
  if (/^BLOCKED\b/i.test(t)) return { kind: 'blocked', reason: m(/^BLOCKED[:\s\-—–]*([\s\S]*)$/i).slice(0, 300) };
  // no keyword: the model stopped talking; treat as blocked with its words, never as success
  return { kind: 'blocked', reason: (t || 'The model ended without a result.').slice(0, 300) };
}

/** `ASK: <one line>` followed by a ```json {"questions":[…]} block (or a bare object). A missing or malformed block
 * still asks: the line becomes one free-text question, so the seeker is never shown nothing. */
export function parseAsk(body: string): Extract<Outcome, { kind: 'ask' }> {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  const open = body.indexOf('{');
  const raw = fence?.[1] ?? (open >= 0 ? body.slice(open, body.lastIndexOf('}') + 1) : '');
  const line = (fence ? body.slice(0, fence.index) : open >= 0 ? body.slice(0, open) : body).replace(/\s+/g, ' ').trim().slice(0, 400);
  let questions: AskQuestion[] | undefined;
  if (raw) {
    try {
      const parsed = askSchema.safeParse(JSON.parse(raw));
      if (parsed.success) questions = parsed.data.questions;
    } catch {
      /* not JSON: the line alone is asked */
    }
  }
  const seen = new Set<string>();
  questions = questions
    ?.filter((q) => !seen.has(q.id) && seen.add(q.id))
    .map((q) => {
      const options = q.type === 'boolean' ? ['Yes', 'No'] : q.options?.filter(Boolean);
      // a choice with no options is a free answer; a boolean always has its two
      const type = (q.type === 'choice' || q.type === 'multi') && !options?.length ? 'text' : q.type;
      return { ...q, type, ...(options?.length && { options }), required: q.required !== false };
    });
  const question = line || questions?.map((q) => q.label).join(' ') || 'Plato needs an answer from you to finish this application.';
  return { kind: 'ask', question, questions: questions?.length ? questions : [{ id: 'answer', label: question, type: 'textarea', required: true }] };
}
