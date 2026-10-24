// One vocabulary for every ATS. An adapter turns the platform's own form
// description into a FormSchema once per job; everything downstream (answer
// mapping, review UI, browser filling) only speaks this.

export type ApplySource =
  | 'LEVER'
  | 'WORKABLE'
  | 'GREENHOUSE'
  | 'ASHBY'
  // Extension-only ATSs (added 2026-10-23): no server-side adapter, the apply worker never claims them.
  | 'SMARTRECRUITERS'
  | 'BAMBOOHR'
  | 'RECRUITEE'
  | 'TEAMTAILOR'
  | 'PERSONIO'
  | 'JAZZHR';

export type FieldType =
  | 'text'
  // Typed on purpose: a number field that receives "10000-20000" silently
  // becomes 1000020000 in the employer's form.
  | 'number'
  | 'date'
  | 'url'
  | 'paragraph'
  | 'email'
  | 'phone'
  | 'boolean'
  | 'choice' // pick one
  | 'multi' // pick many
  | 'file'
  | 'group'; // repeatable sub-form (Workable education/experience)

export interface FormField {
  // Platform-native key: the input `name` on Lever, the field id on Workable.
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  maxLength?: number;
  // The site's help text under the question ("Select all that apply", "must
  // match your video email"). Read by the answering agents, never submitted.
  hint?: string;
}

export interface FormSchema {
  source: ApplySource;
  applyUrl: string;
  fields: FormField[];
}

export type AnswerValue = string | boolean | string[];
export type Answers = Record<string, AnswerValue>;

// Everything we know about the seeker, flattened for mapping + the LLM.
export interface Candidate {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  currentCompany: string;
  summary: string;
  skills: string[];
  links: { linkedin?: string; github?: string; portfolio?: string };
  preferences: {
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    salaryPeriod: string | null;
    availability: string | null;
    yearsExperience: string | null;
    willingToRelocate: boolean;
    visaSponsorshipRequired: boolean;
    // Countries they can work in without sponsorship.
    workAuthorization: string[];
    autoApplyConsent: boolean;
  };
  languages: { language: string; proficiency: string | null }[];
  certifications: { name: string; issuer: string | null }[];
  hasResume: boolean;
  country: string;
  // Whole years between the first job's start and today; null without dates.
  totalYears: number | null;
  // Intake facts, keyed by the intake bank (current_salary, english_level...).
  facts: Record<string, AnswerValue>;
  experiences: {
    title: string;
    company: string;
    start: string | null;
    end: string | null;
    description: string | null;
  }[];
  educations: {
    institution: string;
    degree: string;
    field: string | null;
    start?: string | null; // only the extension's candidate loader fills it (older server-side builders do not)
    end: string | null;
  }[];
  answerBank: Record<string, AnswerValue>;
}

// A question shown to the seeker while the application is NEEDS_INPUT.
export interface PendingQuestion extends FormField {
  // Plato's suggestion, to confirm or edit. Never sent without confirmation.
  draft?: AnswerValue;
  // Personal/demographic: shown as optional, never guessed.
  sensitive?: boolean;
  // Which intake fact answers it, so the seeker's answer is remembered as a
  // fact (works on every employer's wording), not just for this label.
  intakeKey?: string;
}

export interface NeedsInput {
  // questions: answers to confirm. captcha: a human check blocked us.
  // unsupported: a site Plato cannot apply on yet.
  // profile: the application snapshot is missing basics; asked once, not per job.
  // ready: everything is prepared, the seeker presses submit (dry run).
  // resume: the job asks for skills the profile doesn't show; confirm them
  // before a resume is written, so nothing is claimed that isn't true.
  reason:
    'questions' | 'captcha' | 'unsupported' | 'profile' | 'ready' | 'resume';
  message: string;
  questions: PendingQuestion[];
}

export interface SubmitResult {
  dryRun: boolean;
  confirmation: string;
  screenshot?: string;
}

// --- Failure taxonomy. The worker decides retry vs stop from the class. ---

export type FailureKind =
  | 'human_check'
  | 'unknown_fact'
  | 'invalid_answer'
  | 'ineligible'
  | 'duplicate'
  | 'closed'
  | 'site_error'
  | 'unsupported'
  | 'dry_run'
  | 'no_resume';

// Posting is closed/removed. Terminal: EXPIRED.
export class JobExpiredError extends Error {}

// The site asked for a person and nobody completed it. Never retried
// blindly, never reported as submitted.
export class HumanNeededError extends Error {
  constructor(
    message: string,
    readonly indicators: string[] = [],
    // True when a person was given the window and the wait ran out.
    readonly waited = false,
  ) {
    super(message);
  }
}

// The platform rejected our data (validation). Retrying the same payload
// won't help. Terminal: FAILED.
export class PermanentApplyError extends Error {
  constructor(
    message: string,
    readonly kind: FailureKind = 'site_error',
  ) {
    super(message);
  }
}

// The site refused the form (validation). The doctor can often fix this.
export class SiteRejectedError extends PermanentApplyError {
  constructor(
    message: string,
    readonly siteProblems: string[],
  ) {
    super(message, 'invalid_answer');
  }
}

// Plato chose not to apply (not a fit / already handled). Terminal: SKIPPED.
export class SkipApplicationError extends Error {
  constructor(
    message: string,
    readonly kind: 'ineligible' | 'duplicate',
  ) {
    super(message);
  }
}

// Anything else (timeouts, navigation, 5xx) is retried with backoff.
