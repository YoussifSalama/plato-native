import { onboardingOptions } from '../../common/onboarding-options';
import { countryName, resolveCountry } from '../discovery/countries';
import { JobSeekerSnapshot } from '../discovery/job-seeker-snapshot';

// A card of questions the chat UI renders as tappable chips, filled in one
// go and sent back as the next user message. The agent picks WHICH questions
// matter; this file owns what they look like, so the UI never depends on
// model-written markup. Defaults come from the profile: it is the backup
// when the seeker skips a question.

export const QUESTION_IDS = [
  'residence_country',
  'target_countries',
  'work_setup',
  'visa',
  'employment',
  'min_salary',
] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export interface Choice {
  value: string;
  label: string;
}

export interface SalaryAnswer {
  amount: number | null;
  currency: string;
  period: 'MONTHLY' | 'YEARLY';
}

export interface CardQuestion {
  id: QuestionId;
  label: string;
  kind: 'country' | 'countries' | 'choice' | 'multi' | 'salary';
  options?: Choice[];
  default?: string | string[] | SalaryAnswer | null;
}

export interface QuestionCard {
  title: string;
  questions: CardQuestion[];
}

// Countries offered as one-tap chips; "Other" takes any country by name.
const SUGGESTED = ['US', 'CA', 'GB', 'DE', 'NL', 'AE', 'SA', 'EG', 'IN'];

const pick = (key: keyof typeof onboardingOptions): Choice[] =>
  (onboardingOptions[key] as Choice[]).map(({ value, label }) => ({
    value,
    label,
  }));

function countryOptions(snapshot: JobSeekerSnapshot): Choice[] {
  const codes = new Set<string>();
  if (snapshot.residenceCountry) codes.add(snapshot.residenceCountry);
  for (const l of snapshot.preferredLocations) {
    const c = resolveCountry(l);
    if (c) codes.add(c);
  }
  for (const c of SUGGESTED) codes.add(c);
  return [...codes].map((value) => ({ value, label: countryName(value) }));
}

export function buildQuestionCard(
  ids: readonly QuestionId[],
  snapshot: JobSeekerSnapshot,
  title = "Let's set up this search",
): QuestionCard {
  const countries = countryOptions(snapshot);
  const targetDefaults = [
    ...new Set(
      snapshot.preferredLocations
        .map((l) => resolveCountry(l))
        .filter((c): c is string => !!c),
    ),
  ];
  const catalog: Record<QuestionId, CardQuestion> = {
    residence_country: {
      id: 'residence_country',
      label: 'Which country do you live in right now?',
      kind: 'country',
      options: countries,
      default: snapshot.residenceCountry,
    },
    target_countries: {
      id: 'target_countries',
      label: 'Which countries do you want to find work in?',
      kind: 'countries',
      options: countries,
      default: targetDefaults,
    },
    work_setup: {
      id: 'work_setup',
      label: 'How do you want to work?',
      kind: 'multi',
      options: pick('workModes'),
      default: snapshot.workSetup,
    },
    visa: {
      id: 'visa',
      label: 'Will you need visa sponsorship?',
      kind: 'choice',
      options: [
        { value: 'yes', label: 'Yes, I need sponsorship' },
        { value: 'no', label: 'No, I can work there already' },
        { value: 'unsure', label: 'Not sure' },
      ],
      default: snapshot.visaSponsorshipRequired ? 'yes' : 'no',
    },
    employment: {
      id: 'employment',
      label: 'Are you employed at the moment?',
      kind: 'choice',
      options: pick('employmentStatus'),
      default: snapshot.employmentStatus,
    },
    min_salary: {
      id: 'min_salary',
      label: 'What is the lowest salary you would accept?',
      kind: 'salary',
      default: {
        amount: snapshot.salary.min,
        currency: snapshot.salary.currency ?? 'USD',
        period: snapshot.salary.period,
      },
    },
  };
  return { title, questions: ids.map((id) => catalog[id]) };
}
