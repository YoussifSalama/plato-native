// Engine v3 wire contract with the backend brain. Mirrors plato-native-be src/modules/extension/v3/v3-contract.ts.
//   POST /extension/v1/items/:id/v3/turn  { event, results?, text? }  ->  { calls, submit_allowed } | { outcome }
// The call/result shapes are those of Anthropic's browser use tool members; the executor is a plain driver.
export const V3_CONTRACT_VERSION = 1;

export interface BrowserCall {
  call_id: string;
  name: string; // navigate, read_page, find, get_page_text, left_click, type, key, form_input, file_upload, screenshot, zoom, wait, ...
  input: Record<string, unknown>;
}
export interface CallResult {
  call_id: string;
  ok: boolean;
  text?: string;
  image?: { media_type: 'image/png'; data: string };
  state?: { tabs: { tab_id: string; title: string; url: string; active?: boolean }[] };
  error?: string;
}
// A question the brain cannot answer from the profile, shaped so the panel draws the right control (panel/ask-form.ts).
export interface AskQuestion {
  id: string;
  label: string; // a complete question, answerable without seeing the page
  type: 'boolean' | 'choice' | 'multi' | 'text' | 'textarea';
  options?: string[];
  other?: boolean; // "Something else" with a free text box, beside the options
  why?: string; // the form field behind it and the fact the profile lacks
  required?: boolean; // default true
}
export interface SeekerAnswer {
  id: string;
  label: string;
  value: string;
}
export interface TurnRequest {
  // start: open (or restart) the conversation. results: the previous turn's calls ran. seeker_answer: the seeker answered an ASK.
  // solved: the seeker cleared a human check. submit: the item is armed, the model may press Submit once. check: read the page, press nothing.
  event: 'start' | 'results' | 'seeker_answer' | 'solved' | 'submit' | 'check';
  results?: CallResult[];
  text?: string;
  answers?: SeekerAnswer[]; // seeker_answer: the structured answers behind `text`
}
export type Outcome =
  | { kind: 'submit_ready'; summary: string }
  | { kind: 'ask'; question: string; questions?: AskQuestion[] } // question: the one-line summary; questions: what the panel draws (absent from an older backend)
  | { kind: 'captcha'; text: string }
  | { kind: 'closed'; reason: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'confirmed'; quote: string }
  | { kind: 'refused'; quote: string }
  | { kind: 'unconfirmed'; text: string }
  | { kind: 'error'; message: string };
export type TurnResponse = { version: 1; turn: number; calls: BrowserCall[]; submit_allowed: boolean } | { version: 1; turn: number; outcome: Outcome };
