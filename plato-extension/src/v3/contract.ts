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
export interface TurnRequest {
  // start: open (or restart) the conversation. results: the previous turn's calls ran. seeker_answer: the seeker answered an ASK.
  // solved: the seeker cleared a human check. submit: the item is armed, the model may press Submit once. check: read the page, press nothing.
  event: 'start' | 'results' | 'seeker_answer' | 'solved' | 'submit' | 'check';
  results?: CallResult[];
  text?: string;
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
export type TurnResponse = { version: 1; turn: number; calls: BrowserCall[]; submit_allowed: boolean } | { version: 1; turn: number; outcome: Outcome };
