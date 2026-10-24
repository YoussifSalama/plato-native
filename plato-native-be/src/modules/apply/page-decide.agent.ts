import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { metered } from '../usage/usage';
import { ANSWER_RULES, toValue } from './answer-draft.agent';
import { AnswerValue, Candidate, PendingQuestion } from './apply.types';
import { PLAN_RULES, planSchema } from './page-plan.agent';
import { guardPlan, type Plan, type PlanInput } from './page-plan.guard';
import { intakeFor } from './intake';

// A choice question whose answer is a FACT about the seeker (legal status, eligibility, consent, a
// claim about their past or person): only a grounded answer counts; otherwise the seeker decides.
// Any other choice question (a location from the posting, a preference, a yes/no about the role) may be
// answered by the model's pick as long as it is one of the real options: the gate checks the choice
// exists, not that the profile proves it. ponytail: one regex; add words as forms show new fact questions.
const FACT_QUESTION =
  /\b(authori[sz]ed|authori[sz]ation|work permit|visa|sponsorship|legally|eligib|citizen|clearance|background check|criminal|convict|felony|relocat|reside|resident|licen[cs]e|certif|18 years|over 18|under 18|age of|agree|consent|acknowledg|terms|polic(y|ies)|disabilit|veteran|gender|ethnic|race|non-?compete|previously (employed|worked)|former employee|related to|referred by|conflict of interest)\b/i;
export const isFactQuestion = (label: string) => FACT_QUESTION.test(label) || !!intakeFor(label)?.sensitive;

// One AI call per page, for every site: the page (text, controls, open dialog) plus every field the
// extension inspected plus the seeker's whole profile go in; one decision comes out: what kind of
// page this is, a value for every field it can support, the next move, and the one thing (if any)
// only the seeker can decide. The extension fills, verifies, then makes the move. The site's name
// never matters: a one-shot form, a 5-step dialog and a job listing are all just pages.

const decisionSchema = z.object({
  page_type: z.enum(['job_listing', 'application_form', 'multi_step_form', 'review_step', 'confirmation', 'login_wall', 'closed', 'other']),
  fills: z.array(z.object({ id: z.string(), value: z.string(), grounded: z.boolean() })),
  next: planSchema,
  // required fields the profile cannot answer, and why (shown to the seeker as-is)
  missing: z.array(z.object({ field_id: z.string(), reason: z.string().max(200) })),
  // a decision only the seeker can make (e.g. the job needs a skill their profile does not show)
  ask_seeker: z.object({ question: z.string().max(300), choices: z.array(z.string().max(60)).max(4) }).nullable(),
});

const INSTRUCTIONS = `You run one job application in the seeker's own browser, one page at a time. You get the page (text, controls with refs, open dialog), the form fields Plato inspected on it (each with an id), the seeker's profile and the job.

Do three things in ONE answer:
1. page_type: what this page is (job_listing = the posting with an Apply control; application_form = all fields on one page; multi_step_form = a step with Next/Continue; review_step; confirmation = the page says the application was sent; login_wall; closed; other).
2. fills: a value for EVERY field you can support from the profile, by field id. Follow the answer rules below.
3. missing: every REQUIRED field you could not fill, with a short reason the seeker understands.
4. next: the ONE move after those fields are filled, following the planner rules below. Assume your grounded fills will be in the fields: fields.empty counts only the required fields you could NOT fill.

The goal is the strongest application this profile supports, not the minimum the form accepts. An optional field is not optional for you: LinkedIn / GitHub / portfolio / website from the profile's links, a current company, a summary, salary from the preferences, a cover letter or "why us" written from the work history and the job. Leave a field empty only when the profile truly has nothing for it.

Checkboxes (type boolean): decide by what the box does, not by its keywords.
- REQUIRED box (required: true, or its hint says the application cannot be sent without it) that is a consent or acknowledgement for this application: "yes", even when its text also mentions marketing, updates or data retention. The application cannot be sent otherwise, and the seeker asked Plato to apply.
- REQUIRED box that states a fact about the seeker ("I hold a valid US work permit", "I am 18 or older", "I have a driving licence"): "yes" only if the profile shows it is true; otherwise "no" and list it in missing with the reason, so the seeker decides.
- OPTIONAL box: "yes" when it helps the seeker (consider me for other roles, keep my application on file); "no" for marketing, newsletters, text messages, data sharing with third parties, or anything the seeker would not want.

journal is what you already did in THIS application, page by page: what each page was, what you filled, what did not stick and why, which button you pressed, where it stopped. Read it before deciding: continue from where it left off, never redo a step that worked, never press a button that already failed to move the page, and when a value did not stick before, pick a different one that this field accepts.

seekerAnswers holds the seeker's own answers to earlier questions (question -> answer), from any job. They are facts from the seeker: use them for the same or an equivalent question (other wording, other language), and never ask again a question they answer.
seekerSaid holds what the seeker already told you about THIS job in the chat. Use it: "apply anyway" / "yes" / "go on" means proceed with the application and never ask that again; a value they gave (a salary, a notice period) is the answer for that field. Never repeat a question that seekerSaid answers.

Choice questions: answer with one option's EXACT text, copied. Read every option fully before choosing: options often differ by a single "not" ("I have…" / "I do not have…"). Pick the strongest option the profile supports (a full-stack developer with shipped web apps has built backend systems in production).
A field that comes with options is never left empty, required or not, even when its label is only a technical name (e.g. "opportunityLocationId"): read the options and the job to see what it asks. A location list = the job's location (or the one nearest the seeker when the job lists several); a yes/no about the role (hours, remote, start, contract length) = the answer the profile and preferences support; a preference = the seeker's preference. grounded is true only when the profile or the job proves the pick. A fact about the seeker that the profile does not show (work authorization, residence in a given state, background, licence, consent, demographics) is NOT guessed: leave it empty and list it in missing with the reason, unless the options include a "decline"/"prefer not to say" choice for a demographic question, which you pick.

ask_seeker: null almost always. Use it only for a decision that is the seeker's and cannot come from the profile:
- the job clearly requires a core skill or qualification the profile does not show at all (e.g. requires React Native, profile shows none): ask "This job asks for React Native, which is not in your profile. Apply anyway?" with choices ["Apply anyway", "Skip this job"]. Set next to ask.
Never ask the seeker to write something you can write from the profile (cover letter, motivation, summary, short essays): write it.

ANSWER RULES
${ANSWER_RULES}

PLANNER RULES
${PLAN_RULES}`;

export interface DecideField {
  id: string;
  label: string;
  type: PendingQuestion['type'];
  required: boolean;
  options?: string[];
  hint?: string;
}
export interface Decision {
  page_type: z.infer<typeof decisionSchema>['page_type'];
  fills: { id: string; value: AnswerValue }[];
  missing: { field_id: string; reason: string }[];
  next: Plan;
  ask_seeker: { question: string; choices: string[] } | null;
}
export type RawDecision = z.infer<typeof decisionSchema>;

/**
 * Pure checks on the model's decision: every value through the typed gate (what does not fit is
 * dropped), every required field without a value listed as missing, and the move re-checked
 * against the page with those gaps counted. A seeker question always stops the run.
 */
/**
 * The option an answer means. Long options ("A. I have owned and shipped backend services…") are rarely
 * repeated word for word: exact text, then the letter ("A" / "A."), then exactly one option containing the
 * answer (or contained in it). Always one of the real options, or nothing.
 */
export function snapOption(options: string[], answer: string): string | undefined {
  const n = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const a = n(answer);
  if (!a) return undefined;
  const exact = options.find((o) => n(o) === a);
  if (exact) return exact;
  const letter = /^([a-z0-9])[.)]?$/.exec(a)?.[1];
  if (letter) {
    const byLetter = options.find((o) => new RegExp(`^${letter}[.)\\s]`).test(n(o)));
    if (byLetter) return byLetter;
  }
  const contains = options.filter((o) => n(o).includes(a) || a.includes(n(o)));
  if (contains.length === 1) return contains[0];
  // ponytail: no "most shared words" guess: it ignores negation ("I do NOT have backend experience" shares the words of
  // any answer about backend experience). Unclear answers stay unmatched and the seeker is asked.
  return undefined;
}

export function finishDecision(out: RawDecision, fields: DecideField[], page: PlanInput, rule?: (f: DecideField, current?: string) => string | null): Decision {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const fills = out.fills.flatMap((f) => {
    const q = byId.get(f.id);
    if (!q) return [];
    const isChoice = !!q.options?.length && (q.type === 'choice' || q.type === 'multi');
    // a choice answer becomes the option it means (the model shortens or rephrases long options)
    const parts = f.value.split('|').map((part) => part.trim());
    const snapped = isChoice ? parts.map((part) => snapOption(q.options!, part)) : [];
    const raw = isChoice ? parts.map((part, i) => snapped[i] ?? part).join(' | ') : f.value;
    // ungrounded: kept only for a non-fact choice whose every part is a real option (the model chose, the gate checks)
    const ok = f.grounded || (isChoice && parts.length > 0 && snapped.every(Boolean) && !isFactQuestion(q.label));
    const v = ok ? toValue(q as PendingQuestion, q.type === 'multi' ? raw : raw.split(' | ')[0]!) : undefined;
    return v === undefined ? [] : [{ id: f.id, value: v }];
  });
  // profile rules (years of experience, a start date from availability) fill what the model left empty,
  // BEFORE missing and the move are computed, so a rule-filled field never blocks Submit
  // (a rule may also replace a model value it knows better: "immediately" in a date field becomes a date)
  if (rule)
    for (const q of fields) {
      const i = fills.findIndex((f) => f.id === q.id);
      const current = i >= 0 ? String(fills[i]!.value) : undefined;
      const r = rule(q, current);
      const v = r ? toValue(q as PendingQuestion, r) : undefined;
      if (v === undefined) continue;
      if (i >= 0) fills[i] = { id: q.id, value: v };
      else fills.push({ id: q.id, value: v });
    }
  const filled = new Set(fills.map((f) => f.id));
  const said = new Map(out.missing.filter((m) => byId.has(m.field_id)).map((m) => [m.field_id, m.reason]));
  const missing = fields
    .filter((f) => f.required && !filled.has(f.id))
    .map((f) => ({ field_id: f.id, reason: said.get(f.id) ?? 'not in your profile' }));
  const next: Plan = out.ask_seeker
    ? { action: 'ask', ref: null, intent: null, reason: out.ask_seeker.question, skip_reason: null }
    : guardPlan(out.next, { ...page, snapshot: { ...page.snapshot, fields: { ...page.snapshot.fields, empty: missing.length } } });
  return { page_type: out.page_type, fills, missing, next, ask_seeker: out.ask_seeker };
}

export async function decidePage(
  model: string,
  candidate: Candidate,
  job: { title: string; company: string; description: string | null },
  page: PlanInput,
  fields: DecideField[],
  seekerSaid: string[] = [],
  journal: string[] = [],
  rule?: (f: DecideField, current?: string) => string | null,
): Promise<Decision> {
  const agent = new Agent({ name: 'Application runner', instructions: INSTRUCTIONS, model, outputType: decisionSchema });
  const input = JSON.stringify({
    profile: { ...candidate, answerBank: undefined },
    seekerAnswers: candidate.answerBank, // what the seeker answered before, by question: their own facts
    job: { ...job, description: job.description?.slice(0, 3000) ?? null },
    page: page.snapshot,
    fields,
    history: page.history,
    autoSubmit: page.autoSubmit,
    seekerSaid, // the seeker's own answers for this job from the chat
    journal, // what was already done in this application, page by page
  });
  const out = metered('extension.page_decide', model, await run(agent, input)).finalOutput;
  if (!out) return { page_type: 'other', fills: [], missing: [], next: { action: 'ask', ref: null, intent: null, reason: 'I could not read this page.', skip_reason: null }, ask_seeker: null };
  return finishDecision(out, fields, page, rule);
}
