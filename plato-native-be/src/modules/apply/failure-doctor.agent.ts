import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { fits } from './answer-mapper';
import { Answers, AnswerValue, Candidate, FormSchema } from './apply.types';
import { metered } from '../usage/usage';

// When an attempt fails, don't just count it and try the same thing again:
// work out WHY, fix what is fixable, and retry with the fix. The doctor sees
// what the worker saw (the error, which fields the site rejected, the form,
// the answers sent) and may only propose answers that pass the same typed
// gate as everything else. It is never pointed at human checks, closed
// postings or ineligible jobs: nothing to repair there.

export interface FailureReport {
  kind: string;
  message: string;
  // Field ids / messages the site flagged, when the adapter could read them.
  siteProblems: string[];
}

export interface Diagnosis {
  cause: string;
  fixable: boolean;
  // Corrected answers, already validated against their fields.
  patches: Answers;
  // Facts only the seeker can supply (field ids).
  needsSeeker: string[];
}

const doctorSchema = z.object({
  cause: z.string(),
  fixable: z.boolean(),
  patches: z.array(z.object({ id: z.string(), value: z.string() })),
  needsSeeker: z.array(z.string()),
});

const INSTRUCTIONS = `You debug a failed automated job application and propose a fix.
You receive: the failure (kind, message, what the site flagged), the form's fields (id, label, type, required, options, maxLength), the answers that were sent, and the seeker's snapshot.

Work out the most likely cause, then:
- If wrong or missing ANSWERS caused it, return corrected answers in \`patches\` (field id + value). Same truth rules as always: only facts from the snapshot, never invent.
  - number: digits only, one number. date: YYYY-MM-DD. url: full https URL from the snapshot. boolean: "yes"/"no". choice: exactly one of the options. multi: options joined with " | ".
  - Respect maxLength. Required fields must not be empty.
- If a required fact is simply not in the snapshot, list that field id in \`needsSeeker\` instead of guessing.
- Set fixable=false when the cause is not the answers (site outage, selector/timeout, human verification, closed posting) and leave patches empty.
- \`cause\`: one or two plain sentences a job seeker understands. No internal jargon.`;

export async function diagnoseFailure(
  model: string,
  report: FailureReport,
  schema: FormSchema,
  sent: Answers,
  candidate: Candidate,
): Promise<Diagnosis | null> {
  try {
    const agent = new Agent({
      name: 'Application Failure Doctor',
      instructions: INSTRUCTIONS,
      model,
      outputType: doctorSchema,
    });
    const input = JSON.stringify({
      failure: report,
      fields: schema.fields
        .filter((f) => f.type !== 'file' && f.type !== 'group')
        .map(({ id, label, type, required, options, maxLength, hint }) => ({
          id,
          label,
          type,
          required,
          options,
          maxLength,
          hint,
        })),
      sent,
      snapshot: { ...candidate, answerBank: undefined },
    });
    const out = metered(
      'apply.doctor',
      model,
      await run(agent, input),
    ).finalOutput;
    if (!out) return null;

    const byId = new Map(schema.fields.map((f) => [f.id, f]));
    const patches: Answers = {};
    for (const p of out.patches) {
      const field = byId.get(p.id);
      if (!field) continue;
      const raw = p.value.trim();
      const typed: AnswerValue | undefined =
        field.type === 'boolean'
          ? /^y/i.test(raw)
            ? true
            : /^n/i.test(raw)
              ? false
              : undefined
          : field.type === 'multi'
            ? raw.split('|').map((v) => v.trim())
            : raw;
      // A "fix" that doesn't fit the field is not a fix.
      if (typed !== undefined && fits(field, typed)) patches[p.id] = typed;
    }
    return {
      cause: out.cause.trim(),
      fixable: out.fixable && Object.keys(patches).length > 0,
      patches,
      needsSeeker: out.needsSeeker.filter((id) => byId.has(id)),
    };
  } catch {
    return null;
  }
}
