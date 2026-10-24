import { AnswerValue } from './apply.types';

// The intake bank: facts employers' forms keep asking for that live nowhere
// else in the profile. Asked ONCE (onboarding or the chat agent), stored in
// JobSeeker.apply_facts, then matched to form questions by label.
// Seeded from the 2026-09-19 audit of real Workable forms.

export interface IntakeQuestion {
  key: string;
  // How Plato asks the seeker.
  question: string;
  type: 'number' | 'text' | 'choice' | 'date';
  options?: string[];
  // Personal / demographic. Always optional; Plato never guesses these and
  // prefers the form's own "prefer not to say".
  sensitive?: boolean;
  // Form labels this fact answers.
  labels: RegExp;
}

export const INTAKE: IntakeQuestion[] = [
  {
    key: 'current_salary',
    question:
      'What is your current salary (same currency and period as your expected salary)? Skip if you prefer not to share.',
    type: 'number',
    labels: /\bcurrent\b.*\b(salary|compensation|package|ctc|pay)\b/i,
  },
  {
    key: 'english_level',
    question: 'On a scale from 1 to 10, how is your English?',
    type: 'number',
    labels:
      /\benglish\b.*\b(level|proficiency|scale|rate)\b|\b(level|proficiency)\b.*\benglish\b/i,
  },
  {
    key: 'hourly_rate',
    question:
      'If you take hourly work: your expected hourly rate in USD? Skip if not relevant.',
    type: 'number',
    labels: /\bhourly rate\b|\brate per hour\b/i,
  },
  {
    key: 'nationality',
    question: 'What is your nationality?',
    type: 'text',
    labels: /\bnationality\b|\bcitizenship\b/i,
  },
  {
    key: 'driving_license',
    question: 'Do you have a driving licence?',
    type: 'choice',
    options: ['Yes', 'No'],
    labels: /\bdriving licen[cs]e\b|\bhave a car\b/i,
  },
  // --- Sensitive: optional, never inferred ---
  {
    key: 'gender',
    question: 'Some forms require gender. How should I answer? (optional)',
    type: 'choice',
    options: ['Male', 'Female', 'Prefer not to say'],
    sensitive: true,
    labels: /^\s*gender\b|\byour gender\b|\bsex\b/i,
  },
  {
    key: 'pronouns',
    question:
      'Some forms ask for pronouns / title (Mr., Ms.). How should I answer? (optional)',
    type: 'text',
    sensitive: true,
    labels: /\bpronouns?\b|\bsalutation\b|^\s*title\s*$/i,
  },
  {
    key: 'date_of_birth',
    question: 'Some forms require your date of birth (YYYY-MM-DD). (optional)',
    type: 'date',
    sensitive: true,
    labels: /\bdate of birth\b|\bbirth ?date\b|\bd\.?o\.?b\b/i,
  },
  {
    key: 'marital_status',
    question: 'Some forms in the region ask marital status. (optional)',
    type: 'choice',
    options: ['Single', 'Married', 'Prefer not to say'],
    sensitive: true,
    labels: /\bmarital\b/i,
  },
  {
    key: 'military_status',
    question: 'Some forms in the region ask military status. (optional)',
    type: 'choice',
    options: ['Completed', 'Exempted', 'Postponed', 'Not applicable'],
    sensitive: true,
    labels: /\bmilitary\b/i,
  },
];

export const intakeFor = (label: string) =>
  INTAKE.find((q) => q.labels.test(label));

// "N/A" is NOT a decline: for military status it is a claim about the person.
const DECLINE =
  /prefer not|rather not|decline|do(n't| not) wish|not (to )?(say|disclose|specify|answer)/i;

// The form's own way of not answering, when it offers one.
export const declineOption = (options?: string[]) =>
  options?.find((o) => DECLINE.test(o));

// A stored fact expressed as one of THIS form's options ("Male" -> "Male",
// "Completed" -> "Complete the service Military").
export function matchOption(
  options: string[],
  fact: AnswerValue,
): string | undefined {
  if (typeof fact !== 'string') return undefined;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const want = norm(fact);
  return (
    options.find((o) => norm(o) === want) ??
    options.find((o) => norm(o).includes(want) || want.includes(norm(o))) ??
    // Same word, different ending: "Completed" vs "Complete the service",
    // "Exempted" vs "Exemption".
    (want.length >= 6
      ? options.find((o) => norm(o).includes(want.slice(0, want.length - 2)))
      : undefined) ??
    // Pronouns / salutation asked as "Him/Mr." vs "Her/Ms.".
    (/^(he|him|mr|male)/i.test(fact)
      ? options.find((o) => /\b(him|he|mr)\b/i.test(o))
      : /^(she|her|ms|mrs|female)/i.test(fact)
        ? options.find((o) => /\b(her|she|ms|mrs)\b/i.test(o))
        : undefined)
  );
}
