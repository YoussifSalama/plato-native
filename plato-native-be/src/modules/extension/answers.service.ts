import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PendingQuestion } from '../apply/apply.types';
import { PrismaService } from '../prisma/prisma.service';
import { ExtensionBatchService } from './batch.service';
import { CandidateService } from './candidate.service';
import { ExtensionPrincipal } from './extension.service';
import { readSettings } from './settings';
import { planBodySchema } from './page-plan.service';
import { normalizeLabel } from '../apply/answer-mapper';

// Form questions the extension could not map from the profile. The page text is data:
// capped, typed, and only ever turned into draft answers from the seeker's own profile.
const t = (n: number) => z.string().max(n);
const questionSchema = z.object({
        id: t(64).min(1),
        label: t(300).min(1),
        type: z.enum(['text', 'paragraph', 'email', 'phone', 'boolean', 'choice', 'multi', 'number', 'date', 'url']),
        required: z.boolean(),
        options: z.array(t(200)).max(60).optional(),
        maxLength: z.number().int().min(1).max(5000).optional(),
        hint: t(300).optional(),
      });
export const answersSchema = z.object({ questions: z.array(questionSchema).min(1).max(60) });
export type AnswersInput = z.infer<typeof answersSchema>;
// The page planner's input plus every field inspected on the page (0 on a listing page).
export const decideBodySchema = planBodySchema.extend({
  // Own array: zod keeps every check, so `.min(0)` on the answers array would still enforce its `.min(1)`
  // and a listing or confirmation page (0 fields) would be refused (seen live 2026-10-23).
  fields: z.array(questionSchema).max(60),
  notes: z.array(z.string().max(300)).max(10).optional(), // what the seeker said about this job in the chat ("apply anyway", a salary)
  journal: z.array(z.string().max(300)).max(30).optional(), // what Plato already did in this application, page by page
});
export type DecideBody = z.infer<typeof decideBodySchema>;
// The seeker's answers to form questions (from the chat or a ticket): remembered by question text.
export const rememberSchema = z.object({ entries: z.array(z.object({ question: z.string().min(1).max(300), value: z.string().min(1).max(1000) })).min(1).max(20) });
type Question = AnswersInput['questions'][number];
type Profile = { totalYears: number | null; skills: string[]; preferences: { yearsExperience: string | null } };

// "When can you start?" from the onboarding availability, no AI: immediately -> today, 2 weeks -> +14 days,
// 1 month -> +30, 3+ months -> +90. Formatted the way the field asks (a date input wants yyyy-mm-dd; a text
// field is formatted by the pattern in its label, mm/dd/yyyy when it names none). Never a date of birth.
// ponytail: a weekday is not considered; add it if forms reject weekend dates.
const AVAILABILITY_DAYS: Record<string, number> = { immediately: 0, two_weeks: 14, one_month: 30, three_plus_months: 90 };
const START_DATE = /\b(start|available|availability|earliest|join|commence)\b.*\bdate\b|\bdate\b.*\b(start|available|join)\b|when (are|can|could|would) you (start|be available|join)|\b(mm\/dd\/yyyy|dd\/mm\/yyyy|yyyy-mm-dd)\b/i;
// a signature block's date ("Name" + "Date" under an attestation): today
const TODAY_DATE = /^\s*date\s*:?\s*$|today'?s date|date signed|signature date|current date/i;
export function dateAnswer(q: Question, c: { preferences: { availability: string | null } }, today = new Date(), current?: string): string | null {
  const label = `${q.label} ${q.hint ?? ''}`;
  if (/birth|d\.?o\.?b\b/i.test(label)) return null;
  if (current && /\d/.test(current)) return null; // the model already gave a date; only a word ("immediately") is replaced
  const signature = TODAY_DATE.test(q.label);
  if (!signature && q.type !== 'date' && !START_DATE.test(label)) return null;
  const days = signature ? 0 : c.preferences.availability ? AVAILABILITY_DAYS[c.preferences.availability] : undefined;
  if (days === undefined) return null;
  const d = new Date(today.getTime() + days * 86_400_000);
  const [y, m, day] = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
  if (q.type === 'date' || /yyyy-mm-dd/i.test(label)) return `${y}-${m}-${day}`;
  if (/dd\/mm\/yyyy/i.test(label)) return `${day}/${m}/${y}`;
  return `${m}/${day}/${y}`;
}

// "How many years…" from the profile, no AI: years since the first job, else the low end of the
// onboarding range ("3-5" -> 3). A question naming tools ("with React and Node") is answered only
// when the seeker lists at least one of them as a skill.
// ponytail: overall years stand in for per-skill years; per-skill dates when experiences carry skills.
export function yearsAnswer(q: Question, c: Profile): string | null {
  if (!/how many years|years of (\w+ )?experience/i.test(q.label)) return null;
  const years = c.totalYears ?? (c.preferences.yearsExperience ? parseInt(c.preferences.yearsExperience, 10) : NaN);
  if (!Number.isFinite(years)) return null;
  const label = q.label.toLowerCase();
  if (/\b(with|in|using)\b/.test(label) && !c.skills.some((s) => s.length > 1 && label.includes(s.toLowerCase()))) return null;
  if (!q.options?.length) return String(years);
  // a choice: the option whose range holds the number ("3-5", "5+", "Less than 1")
  return (
    q.options.find((o) => {
      const [lo, hi] = (o.match(/\d+/g) ?? []).map(Number);
      if (lo === undefined) return false;
      if (/\+|more|over/i.test(o)) return years >= lo;
      if (/less|under/i.test(o)) return years < lo;
      return years >= lo && years <= (hi ?? lo);
    }) ?? null
  );
}

@Injectable()
export class AnswersService {
  private readonly log = new Logger('AnswersService');
  constructor(
    private readonly prisma: PrismaService,
    private readonly batches: ExtensionBatchService,
    private readonly candidates: CandidateService,
  ) {}

  // Everything the AI may use for this item: the seeker's snapshot, the job, their settings.
  private async context(p: ExtensionPrincipal, itemId: string) {
    await this.batches.assertWorking(p, itemId); // only the device holding the item
    const item = await this.prisma.applyBatchItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { job_id: true },
    });
    const job = await this.prisma.job.findUniqueOrThrow({
      where: { id: item.job_id },
      select: { title: true, company: true, description: true },
    });
    const candidate = await this.candidates.load(p.jobSeekerId);
    const settings = readSettings((await this.prisma.jobSeeker.findUnique({ where: { id: p.jobSeekerId }, select: { extension_settings: true } }))?.extension_settings);
    // the page decision is the core of applying: the strong model unless APPLY_MODEL says otherwise (not CHAT_MODEL: that is the web chat's)
    const model = process.env.APPLY_MODEL ?? 'gpt-4.1';
    // The seeker's own note goes into cover letters / messages (as their words, not a fact source).
    const description = settings.customMessage ? `${job.description ?? ''}\n\n[The applicant's own note to work into any cover letter or message: "${settings.customMessage}"]` : job.description;
    return { candidate, settings, model, job: { ...job, description } };
  }

  /**
   * The whole page in one AI call: page type, a value for every field, the next move, and the one
   * question only the seeker can answer. AI down: the profile's years answers and an honest stop.
   */
  async decide(p: ExtensionPrincipal, itemId: string, body: DecideBody) {
    const { candidate, settings, model, job } = await this.context(p, itemId);
    const isCover = (q: { label: string }) => /cover letter|motivation letter/i.test(q.label);
    const fields = body.fields.filter((q) => settings.coverLetter || !isCover(q));
    try {
      // ponytail: lazy import, the agents SDK is ESM-only and breaks specs that load the controllers
      const { decidePage } = await import('../apply/page-decide.agent');
      // profile rules go into the decision itself (before missing / the move), not merged after it
      const rule = (q: Question, current?: string) => (current ? null : yearsAnswer(q, candidate)) ?? dateAnswer(q, candidate, new Date(), current);
      const d = await decidePage(model, candidate, job, { snapshot: body.snapshot, history: body.history, autoSubmit: body.autoSubmit }, fields, body.notes ?? [], body.journal ?? [], (f, current) => rule(f as Question, current));
      // Audit: what the decision was, per item (ids + short values), so a wrong pick is visible in the backend log.
      this.log.log(`decide ${itemId}: fields ${fields.map((q) => `${q.id}:${q.label.slice(0, 30)}[${q.type}${q.required ? '*' : ''}${q.options ? `,${q.options.length}opt` : ''}]`).join(' ')}; fills ${d.fills.map((f) => `${f.id}=${String(Array.isArray(f.value) ? f.value.join('|') : f.value).slice(0, 40)}`).join(', ') || '-'}; missing ${d.missing.map((m) => m.field_id).join(',') || '-'}; next ${d.next.action}${d.next.intent ? ' ' + d.next.intent : ''}`);
      return { ...d, fills: d.fills.map((f) => ({ id: f.id, value: Array.isArray(f.value) ? f.value.join(' | ') : typeof f.value === 'boolean' ? (f.value ? 'yes' : 'no') : String(f.value) })) /* always text: the extension reads yes/no */, aiFailed: false };
    } catch (e) {
      this.log.warn(`decide ${itemId} failed: ${e instanceof Error ? e.message : String(e)}`);
      const fills = fields.flatMap((q) => { const v = yearsAnswer(q, candidate) ?? dateAnswer(q, candidate); return v ? [{ id: q.id, value: v }] : []; });
      return { page_type: 'other', fills, missing: [], next: { action: 'ask', ref: null, intent: null, reason: 'The AI is not reachable right now.', skip_reason: null }, ask_seeker: null, aiFailed: true };
    }
  }

  /** Remember the seeker's answers by question, for every later form (same store as the server-side apply flow). */
  async remember(p: ExtensionPrincipal, entries: { question: string; value: string }[]) {
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({ where: { id: p.jobSeekerId }, select: { apply_answers: true } });
    const bank = { ...((seeker.apply_answers ?? {}) as Record<string, unknown>) };
    for (const e of entries) {
      const key = normalizeLabel(e.question);
      if (key) {
        delete bank[key]; // re-inserted last: the newest answers are the ones kept
        bank[key] = e.value.trim();
      }
    }
    const kept = Object.fromEntries(Object.entries(bank).slice(-300)); // ponytail: cap; a real store if it grows past this
    await this.prisma.jobSeeker.update({ where: { id: p.jobSeekerId }, data: { apply_answers: kept as object } });
    return { remembered: entries.length };
  }

  /** Drafts only from the profile; an answer the profile cannot support comes back null. */
  async draft(p: ExtensionPrincipal, itemId: string, input: AnswersInput) {
    const { candidate, settings, model, job } = await this.context(p, itemId);
    // ponytail: lazy import, the agents SDK is ESM-only and breaks specs that load the controllers
    const { draftAnswers } = await import('../apply/answer-draft.agent');
    // Cover letters off: those questions are left for the seeker, never drafted.
    const isCover = (q: { label: string }) => /cover letter|motivation letter/i.test(q.label);
    const qs: PendingQuestion[] = input.questions.filter((q) => settings.coverLetter || !isCover(q)).map((q) => ({ ...q, options: q.options }));
    // The AI maps the whole form from the whole profile. The years rule only fills what it left
    // empty, and is all there is when the AI is down.
    let drafted = new Map<string, string | boolean | null>();
    let aiFailed = false;
    try {
      const out = await draftAnswers(model, candidate, job, qs);
      drafted = new Map(out.map((q) => [q.id, q.draft === undefined ? null : Array.isArray(q.draft) ? q.draft.join(' | ') : q.draft]));
    } catch {
      aiFailed = true; // network / provider down
    }
    const answers = qs.map((q) => ({ id: q.id, value: drafted.get(q.id) ?? yearsAnswer(q as Question, candidate) }));
    return { answers, aiFailed };
  }
}
