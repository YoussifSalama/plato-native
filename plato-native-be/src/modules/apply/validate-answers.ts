import { fits } from './answer-mapper';
import { Answers, FormSchema } from './apply.types';

// Last gate before a browser opens. Everything that reaches an employer has
// to pass here, whatever produced it. Pure, so the audit's real failure
// cases are unit tests.

export interface AnswerProblem {
  fieldId: string;
  label: string;
  problem: string;
}

// Text that must never reach an employer: model self-talk, internal notes.
const LEAK =
  /\b(snapshot|grounded|not supported by|as an ai|language model|placeholder|lorem ipsum|dry run)\b/i;
export const INTERVIEW_FILLER =
  'I would be glad to go into this in detail in an interview.';

export function validateAnswers(
  schema: FormSchema,
  answers: Answers,
): AnswerProblem[] {
  const problems: AnswerProblem[] = [];
  for (const field of schema.fields) {
    if (field.type === 'file' || field.type === 'group') continue;
    const value = answers[field.id];
    const bad = (problem: string) =>
      problems.push({ fieldId: field.id, label: field.label, problem });

    if (value === undefined || value === '') {
      if (field.required) bad('required but unanswered');
      continue;
    }
    if (!fits(field, value)) {
      bad(`"${String(value).slice(0, 40)}" is not a valid ${field.type}`);
      continue;
    }
    if (typeof value !== 'string') continue;
    if (field.maxLength && value.length > field.maxLength)
      bad(`longer than the ${field.maxLength} characters the form allows`);
    if (LEAK.test(value)) bad('contains internal wording');
    // The filler is only honest for open essay questions.
    if (value === INTERVIEW_FILLER && field.type !== 'paragraph')
      bad('filler sentence in a short-answer field');
  }
  return problems;
}
