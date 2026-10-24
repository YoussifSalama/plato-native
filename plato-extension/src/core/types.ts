export const ITEM_STATES = [
  'PENDING',
  'CLAIMED',
  'PREPARING',
  'NEEDS_USER',
  'FILLING',
  'REVIEW',
  'AWAITING_SUBMIT',
  'SUBMITTED_CONFIRMED',
  'SUBMITTED_ATTESTED',
  'VERIFY',
  'FAILED',
  'SKIPPED',
  'CANCELLED',
] as const;
export type ItemState = (typeof ITEM_STATES)[number];

// Mirrors the backend item DTO (plato-native-be batch.service.ts).
export interface ApiItem {
  id: string;
  batch_id: string;
  job_id: string;
  provider: string | null;
  state: ItemState;
  attempt_id: string | null;
  seq: number;
  lease_expires_at: string | null;
  detail: Record<string, unknown> | null;
  verify_reason: string | null;
  job?: { title: string; company: string; url: string; apply_url?: string | null } | null;
  batch?: { label: string | null; created_at: string } | null;
  mine?: boolean; // false = another linked browser holds it right now // which pick / search the job came from
  resume_choice?: 'profile' | 'tailored' | null; // which resume this application uploads (asked once)
}

export type ProviderPolicy = 'FILL_ONLY' | 'BLOCKED';
export type PolicyMap = Record<string, ProviderPolicy>;

export interface TransitionBody {
  attempt_id: string;
  seq: number;
  to: Exclude<ItemState, 'PENDING' | 'CLAIMED'>;
  detail?: {
    failure_kind?: string;
    message?: string;
    marker?: string;
    reason?: string;
  };
}

/** What a read-only look at the live page says about a submission. */
export type Evidence =
  | { kind: 'confirmed'; marker: string }
  | { kind: 'form-present' }
  | { kind: 'gone' }
  | { kind: 'unknown' };

// The parts of the backend's candidate snapshot the extension reads. Identity
// only: nothing here is an answer to a question or part of a resume.
export interface Candidate {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string; // "City, Country"
  country: string;
  currentCompany: string;
  links: { linkedin?: string | null; github?: string | null; portfolio?: string | null };
}

// Wizard: what the seeker picks before anything is queued.
export interface SearchCard {
  id: string;
  title: string;
  locations: string[];
  remote: string | null;
  job_count: number;
  featured: boolean;
  queued?: number; // jobs added from the Plato web app in this search
  created_at: string;
}
export interface SearchJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  source: string;
  site?: string | null; // the site Plato fills, e.g. GREENHOUSE for an Indeed listing
  match: number | null; // 0-100, same as the web's cards
  applyable: boolean; // false = Plato cannot fill this site yet
  queued?: boolean; // added from the Plato web app: pre-ticked in the wizard
}
export interface ConsentBody {
  decision: 'allow' | 'decline';
  reason?: string;
  jobs: number;
  tabs: number;
  auto_submit?: boolean; // the seeker let Plato press Submit for this run
}

// What the apply orchestrator agent asks the panel to do (mirrors the backend).
export type OrchestratorEvent =
  | { type: 'report'; text: string }
  | { type: 'ask'; jobId: string | null; question: string; choices: string[] }
  | { type: 'account'; jobId: string; site: string; reason: string }
  | { type: 'skip'; jobId: string; reason: string }
  | { type: 'pause'; reason: string }
  | OrchestratorEventFill
  | { type: 'resume' }
  | { type: 'attach_resume'; jobId: string }
  | { type: 'retry'; jobId: string }
  | { type: 'submit'; jobId: string }
  | { type: 'refresh' };
export interface OrchestratorRequest {
  message: string | null;
  history: { role: 'user' | 'assistant'; content: string }[];
  state: {
    total: number;
    maxTabs: number;
    counts: { queued: number; working: number; review: number; submitted: number; failed: number; skipped: number };
    blocked: { id: string; title: string; company: string; blocker: 'missing_data' | 'needs_account' | 'captcha' | 'login' | 'mfa' | 'questions' | 'submit_failed' | 'other'; detail: string; fields?: string[] }[];
    // every job open on screen, with the truth about its form: the chat never guesses what is filled
    jobs?: { id: string; title: string; company: string; status: string; filled: string[]; empty: string[]; resume: 'uploaded' | 'missing' | 'none'; journal?: string[]; choices?: { label: string; options: string[] }[] }[];
  };
}

// A form field the profile mapping could not fill: sent to the backend to draft an answer from the profile.
export interface AnswerQuestion {
  id: string;
  label: string;
  type: 'text' | 'paragraph' | 'email' | 'phone' | 'boolean' | 'choice' | 'multi' | 'number' | 'date' | 'url';
  required: boolean;
  options?: string[];
  hint?: string; // context the AI needs: the form the field sits in, or why the last value failed
}
export type OrchestratorEventFill = { type: 'fill'; jobId: string; field: string; value: string };

// Server-side filters for a search's job list: same vocabulary as the web's Jobs page.
export interface JobFilters {
  q?: string;
  sort?: 'best' | 'newest' | 'salary' | 'company';
  source?: string;
  remoteType?: 'REMOTE' | 'HYBRID' | 'ONSITE';
  jobType?: 'full' | 'part' | 'contract' | 'intern' | 'temporary';
  level?: 'junior' | 'mid' | 'senior';
  fromPlato?: boolean; // only the jobs added from the Plato web app
}
export interface JobsPage {
  total: number;
  items: SearchJob[];
  sources?: { value: string; count: number }[]; // only on the first page
  queued?: string[]; // first page only: ids added from the Plato web app (any page)
}

// The AI page planner's answer (see plato-native-be page-plan.agent.ts).
export interface PlanMove {
  action: 'press' | 'wait' | 'ask' | 'skip' | 'done';
  ref: string | null;
  intent: 'open_apply' | 'next' | 'review' | 'submit' | 'other' | null;
  reason: string;
  skip_reason: 'closed' | 'already_applied' | 'not_a_job' | null;
}

// The backend's one decision for a page (POST /items/:id/decide).
export interface Decision {
  page_type: string;
  fills: { id: string; value: string }[];
  missing: { field_id: string; reason: string }[];
  next: PlanMove;
  ask_seeker: { question: string; choices: string[] } | null;
  aiFailed: boolean;
}
