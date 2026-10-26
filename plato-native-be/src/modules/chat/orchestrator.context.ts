import { RankingAgentContext } from '../discovery/agent/ranking-agent.context';
import type { ApplyService } from '../apply/apply.service';
import type { JobSeekerSnapshot } from '../discovery/job-seeker-snapshot';
import type { QuestionCard } from './intake';
import type { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';

// Side-effects the agent performed during one turn, surfaced to the client
// alongside the text reply so the UI can react (e.g. switch to "searching").
export const APP_PAGES = [
  'home',
  'jobs',
  'applications',
  'career',
  'messages',
  'notifications',
  'profile',
] as const;
export type AppPage = (typeof APP_PAGES)[number];

export const FILTER_KEYS = [
  'remoteType',
  'jobType',
  'level',
  'location',
  'salaryMin',
  'hasSalary',
  'postedWithinDays',
  'acceptsCountry',
  'salaryCurrency',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

// The UI vocabulary of the results list; the client applies these as-is.
export type UiFilters = Partial<{
  remoteType: 'REMOTE' | 'HYBRID' | 'ONSITE';
  jobType: 'full' | 'part' | 'contract' | 'intern' | 'temporary';
  level: 'junior' | 'mid' | 'senior';
  location: string;
  salaryMin: number;
  hasSalary: boolean;
  postedWithinDays: number;
  acceptsCountry: string;
  salaryCurrency: string;
}>;

export type OrchestratorEvent =
  | { type: 'search_started'; runId: string }
  | {
      type: 'navigate';
      page: AppPage;
      tab?: 'discover' | 'saved' | 'applied' | 'recommended';
    }
  // 1-based position in the list the seeker is looking at.
  | { type: 'open_job'; position: number }
  | {
      type: 'apply_filter';
      filters: UiFilters;
      sort?: 'best' | 'newest' | 'salary' | 'company';
      q?: string;
    }
  | { type: 'remove_filter'; keys: FilterKey[] | 'all' }
  // The seeker must approve in the UI; the agent never submits anything itself.
  | { type: 'propose_apply'; positions?: number[]; top?: number }
  // Click / type into a control from the page map by its id.
  | { type: 'click'; elementId: string; more?: boolean }
  | { type: 'type_text'; elementId: string; text: string; more?: boolean }
  // Open an app path (checked against an allow-list).
  | { type: 'goto'; path: string; more?: boolean }
  // Open the extension progress sidebar.
  | { type: 'open_extension_progress' };

export interface OrchestratorContext extends RankingAgentContext {
  jobSeekerId: string;
  threadId: string;
  events: OrchestratorEvent[];
  // What the browser extension is doing for this seeker (read-only; extension/progress.ts).
  extensionProgress: () => Promise<unknown>;
  // The seeker's Plato tokens summary (credits/estimates.service.ts): no money costs or rates in it.
  tokens: () => Promise<unknown>;
  // Application snapshot: read what's missing, save what the seeker says.
  applyService: ApplyService;
  preferenceService: JobSeekerPreferenceService;
  // Profile picture of the seeker: defaults for the intake card.
  snapshot: JobSeekerSnapshot;
  // Set by ask_user_questions; saved with the assistant's reply.
  card?: QuestionCard;
}
