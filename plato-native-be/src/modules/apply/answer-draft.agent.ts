import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { fits } from './answer-mapper';
import { AnswerValue, Candidate, PendingQuestion } from './apply.types';
import { metered } from '../usage/usage';

// Drafts answers to an employer's screening questions from the seeker's
// profile. Drafts are suggestions: the seeker confirms or edits every one
// before anything is sent, so the agent must never invent experience.

const draftsSchema = z.object({
  drafts: z.array(
    z.object({
      id: z.string(),
      // Booleans as "yes"/"no"; multi-select joined with " | ".
      value: z.string(),
      // False when the profile does not support an answer.
      grounded: z.boolean(),
    }),
  ),
});

export const ANSWER_RULES = `You fill an employer's application form on behalf of a job seeker.
You receive their application snapshot (profile, preferences, work history), the job, and the form's questions.
Your answers are SENT AS-IS, with no human review. Answer every question the snapshot supports, in first person, the way the seeker would.

Truth rules (never break these):
- Use ONLY facts in the snapshot. Never invent employers, years, tools, degrees, numbers, links or names.
- Compute, don't guess: total years = span of the work history; years with a technology = the roles that list it.
- If the snapshot cannot support an answer, return value "" and grounded false. Do not pad or bluff.

How to answer:
- Yes/no: value is exactly "yes" or "no". "yes" only when the snapshot clearly shows it. When a requirement is clearly not met (e.g. asks 10 years, history shows 3), answer "no". Location questions: compare with the seeker's location and work authorization.
- Years with a specific technology or domain that appears NOWHERE in the snapshot: that is a known fact, not a gap. Answer truthfully and grounded: "0 years" / "I have not worked with Java professionally; my backend experience is in Node.js and NestJS (3 years)." Same for yes/no about such a skill: "no".
- Years of experience: a number or short range from the snapshot (e.g. "3 years"), not a paragraph.
- Salary: use preferences.salaryMin/Max with its currency and period. Convert monthly<->annual if the question names a period. If the question names a different currency, answer in the seeker's own currency and say so (e.g. "20000 EGP per month"). One short line.
- Notice period / start date: from preferences.availability ("immediately", "two_weeks" -> "2 weeks", "one_month" -> "1 month", "three_plus_months" -> "3 months").
- Work authorization / visa: from preferences.workAuthorization and visaSponsorshipRequired. Relocation: willingToRelocate.
- Links (LinkedIn, GitHub, portfolio): the URL from snapshot.links, else grounded false.
- Phone / WhatsApp: the snapshot phone.
- Language levels: ONLY from snapshot.languages. A language that is not listed is not spoken: choose the lowest option ("B1 or lower", "None"), never a higher one.
- Demographic questions (gender, ethnicity, age, disability, veteran status, religion): never infer. Choose the option that means "prefer not to say" if there is one; otherwise return grounded false.
- The question's \`type\` is a hard format rule:
  - number: digits only, ONE number (never a range, never units or words). "How many years with X" -> "3". A rating "1 to 10" -> one integer.
  - date: YYYY-MM-DD.
  - url: a full https:// URL that is in the snapshot, else grounded false. Never a sentence.
  - text: one short line. paragraph: prose.
- Never state a fact that is not in the snapshot by borrowing another one: current salary is NOT expected salary; if it isn't there, grounded false.
- Never write notes about yourself, the snapshot, conversions or what you could not do. Only the answer the employer should read.
- Choice questions: value must be exactly one of the given options (multi-select: options joined with " | "). When the seeker's true value is not among the options (their country is not in the list), pick the closest truthful option: "Other", "None of the above", "No", "Prefer not to say". Never leave a required choice empty when such an option exists, and never pick a false one. Multi-select never mixes "None of the above" / "None" with other options: pick the real ones, or only the "none" option.
- Each question's \`hint\` is the site's own help text and its rules. Obey it (e.g. "must match the email you used", "changing it later may disqualify you"), and read the whole form before answering so related questions stay consistent with each other.
- Essay questions: 2-5 concrete sentences naming real roles, companies and technologies from the work history. No filler, no flattery, no claims beyond the snapshot.
- Cover letter: 4-6 sentences tying real experience to this job's requirements.
- A hint that starts "Your last answer ... did not work" is the page's reaction to your previous value. Give a corrected value in a format this field accepts (an exact option, digits only, a shorter text, the format the page asks for). If no truthful value fits, return "" with grounded false: the seeker will be asked.
- Return one draft per question id.`;

// Whatever the model says goes through the same typed gate as every other
// answer; anything that doesn't fit the field is dropped, not "fixed up".
export function toValue(q: PendingQuestion, raw: string): AnswerValue | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  let typed: AnswerValue | undefined = value;
  if (q.type === 'boolean')
    typed = /^y/i.test(value) ? true : /^n/i.test(value) ? false : undefined;
  else if (q.type === 'multi') typed = value.split('|').map((v) => v.trim());
  else if (q.type === 'number')
    // "3 years" -> 3. A range or prose is not a number: drop it.
    typed = /^\D*(\d+(\.\d+)?)\D*$/.exec(value)?.[1];
  return typed !== undefined && fits(q, typed) ? typed : undefined;
}

export async function draftAnswers(
  model: string,
  candidate: Candidate,
  job: { title: string; company: string; description: string | null },
  questions: PendingQuestion[],
): Promise<PendingQuestion[]> {
  if (!questions.length) return questions;
  const agent = new Agent({
    name: 'Application Answer Drafter',
    instructions: ANSWER_RULES,
    model,
    outputType: draftsSchema,
  });
  // The answer bank is the seeker's private history, not profile evidence.
  const profile = { ...candidate, answerBank: undefined };
  const input = JSON.stringify({
    profile,
    job: { ...job, description: job.description?.slice(0, 3000) ?? null },
    questions: questions.map(
      ({ id, label, type, options, maxLength, hint }) => ({
        id,
        label,
        type,
        options,
        maxLength,
        hint,
      }),
    ),
  });
  const result = metered('apply.answers', model, await run(agent, input));
  const drafts = new Map(
    (result.finalOutput?.drafts ?? [])
      .filter((d) => d.grounded)
      .map((d) => [d.id, d.value]),
  );
  return questions.map((q) => ({
    ...q,
    draft: drafts.has(q.id) ? toValue(q, drafts.get(q.id)!) : undefined,
  }));
}
