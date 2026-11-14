import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { research } from '../career/research.agent';
import { metered } from '../usage/usage';
import type { SectionKind } from './quiz.contract';
import type { SectionDraft, SectionPlan } from './quiz-build';

// The Quiz Builder's AI steps, generic for any company and any role: understand the job, find (or infer) how that
// company tests candidates, write each section in that format. Every step is metered (the seeker pays in tokens) and
// time-limited; the caller decides what a failure means.

const KINDS = [
  'work_simulation',
  'work_style',
  'situational',
  'numerical',
  'logical',
  'verbal',
  'technical',
  'skills',
  'language',
  'personality',
] as const satisfies readonly SectionKind[];

async function structured<T extends z.ZodTypeAny>(
  feature: string,
  model: string,
  instructions: string,
  input: string,
  outputType: T,
  timeoutMs: number,
): Promise<z.infer<T>> {
  const agent = new Agent({ name: feature, instructions, model, outputType });
  const result = await Promise.race([
    run(agent, input).then((r) => metered(feature, model, r)),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${feature} timed out`)), timeoutMs),
    ),
  ]);
  if (!result.finalOutput) throw new Error(`${feature} returned nothing`);
  return result.finalOutput as z.infer<T>;
}

// ---- 1. understand the job -------------------------------------------------------------------------------------
const jobSchema = z.object({
  role: z.string().describe('The job title, as the posting names it.'),
  roleFamily: z
    .string()
    .describe(
      'The role without level words: "Senior SDE II" -> "software development engineer".',
    ),
  company: z
    .string()
    .nullable()
    .describe('The hiring company, or null when the text does not say.'),
  level: z.enum(['entry', 'mid', 'senior', 'lead']).nullable(),
  skills: z
    .array(z.string())
    .describe('The 5-10 skills and knowledge areas the job needs most.'),
  summary: z
    .string()
    .describe('Two sentences: what the job does and what it demands.'),
});
export type JobBrief = z.infer<typeof jobSchema>;

export function understandJob(
  model: string,
  input: {
    title?: string | null;
    company?: string | null;
    description: string;
  },
) {
  return structured(
    'quiz.understand',
    model,
    'Read a job posting and extract what a hiring test for it would assess. Use only what the text says; never invent a company.',
    JSON.stringify({
      title: input.title ?? null,
      company: input.company ?? null,
      description: input.description.slice(0, 8000),
    }),
    jobSchema,
    30_000,
  );
}

// ---- 2. the format: research how the company tests, then plan the sections ---------------------------------------
const planSchema = z.object({
  about: z
    .string()
    .describe(
      '2-4 plain sentences for the seeker: how this company tests candidates for this role (or, when unknown, what this practice test covers and why), so they know what they are practising.',
    ),
  sections: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        title: z
          .string()
          .describe(
            'Short, as the company calls it when known ("Work Simulation", "Work Style Assessment", "Numerical Reasoning").',
          ),
        instructions: z
          .string()
          .describe(
            'What the seeker does in this section, 1-2 sentences, like a real test screen.',
          ),
        questionCount: z.number().int(),
        timeLimitMin: z
          .number()
          .nullable()
          .describe(
            'Minutes, when the real test times this part; null otherwise.',
          ),
      }),
    )
    .describe('2-4 sections in the order the real test runs them.'),
});
export type FormatPlan = z.infer<typeof planSchema> & {
  sources: { title: string; url: string }[];
};

const PLAN_RULES = `You design a realistic practice version of a company's hiring test for one role.
- If the research describes the company's real assessment (for example: work simulations, work-style/personality pairs, numerical or logical reasoning, coding or role-knowledge tests, situational judgement), mirror its sections, order and timing.
- If the research found nothing useful, design the test a company of that kind would most likely use for this role, from the job's requirements. Examples: software engineer -> technical knowledge + logical reasoning + situational judgement; finance or consulting -> numerical + verbal + work style; sales or customer roles -> situational judgement + work simulation + language; operations -> work simulation + numerical.
- 2-4 sections, 18-36 questions in total, about 20-40 minutes. Work-style sections are quick (many short items); scenario sections have 3-4 questions per scenario.
- Never copy wording from any source; you only decide the structure.`;

export async function planFormat(
  model: string,
  searchModel: string,
  job: JobBrief,
): Promise<FormatPlan> {
  let found = { found: false, answer: '', sources: [] as string[] };
  if (job.company) {
    found = await research(
      searchModel,
      `How does ${job.company} assess candidates for ${job.role} roles? Describe the online assessment or hiring test: its sections, question formats (for example work simulation, work style, numerical, logical, coding, situational judgement), number of questions and time limits. Company: ${job.company}. Role: ${job.role}.`,
    ).catch(() => found);
  }
  const plan = await structured(
    'quiz.plan',
    model,
    PLAN_RULES,
    JSON.stringify({
      job,
      research: found.found
        ? found.answer
        : "No reliable information found about this company's hiring test.",
    }),
    planSchema,
    45_000,
  );
  const sections = plan.sections
    .filter((s) => s.questionCount > 0)
    .slice(0, 4)
    .map((s) => ({
      ...s,
      questionCount: Math.max(3, Math.min(16, s.questionCount)),
      timeLimitMin:
        s.timeLimitMin && s.timeLimitMin > 0
          ? Math.min(60, s.timeLimitMin)
          : null,
    }));
  return {
    ...plan,
    sections,
    sources: found.sources.map((url) => ({ title: hostOf(url), url })),
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// ---- 3. write a section ----------------------------------------------------------------------------------------
const mediaSchema = z.object({
  kind: z.enum(['message', 'table', 'chart']),
  from: z.string().nullable().describe('message: sender name'),
  role: z
    .string()
    .nullable()
    .describe('message: sender role, e.g. "Sr. Recruiter"'),
  body: z.string().nullable().describe('message: the text, with line breaks'),
  caption: z.string().nullable(),
  columns: z.array(z.string()).describe('table: header cells'),
  rows: z
    .array(z.array(z.string()))
    .describe('table: one array per row, same length as columns'),
  legend: z.string().nullable(),
  title: z.string().nullable().describe('chart title'),
  chart: z.enum(['bar', 'line']).nullable(),
  labels: z.array(z.string()).describe('chart: x labels'),
  series: z
    .array(z.object({ name: z.string(), values: z.array(z.number()) }))
    .describe('chart: one value per label'),
  unit: z.string().nullable(),
});
const figureSchema = z.object({
  shapes: z.array(
    z.object({
      shape: z.enum([
        'circle',
        'square',
        'rectangle',
        'triangle',
        'diamond',
        'hexagon',
        'star',
        'arrow',
        'line',
        'cross',
      ]),
      x: z.number().describe('centre 0-100'),
      y: z.number().describe('centre 0-100'),
      size: z.number().describe('5-60'),
      rotation: z.number().nullable(),
      fill: z.enum(['none', 'solid', 'striped', 'dotted']).nullable(),
    }),
  ),
});
const questionSchema = z.object({
  type: z.enum([
    'single_choice',
    'multi_choice',
    'rating',
    'ranking',
    'work_style',
    'pattern',
  ]),
  scenarioId: z.string().nullable(),
  prompt: z.string().nullable(),
  media: z
    .array(mediaSchema)
    .describe('Extra table/chart for this question only; usually empty.'),
  choices: z.array(
    z.object({
      id: z.string(),
      text: z.string().nullable(),
      figure: figureSchema.nullable(),
    }),
  ),
  items: z.array(z.object({ id: z.string(), text: z.string() })),
  pick: z.number().int().nullable(),
  scale: z
    .object({
      max: z.number().int(),
      minLabel: z.string(),
      maxLabel: z.string(),
    })
    .nullable(),
  left: z.string().nullable(),
  right: z.string().nullable(),
  sequence: z.array(figureSchema),
  correct: z.array(z.string()),
  ideal: z.number().int().nullable(),
  order: z.array(z.string()),
  preferred: z.enum(['left', 'right', 'either']).nullable(),
  trait: z.string().nullable(),
  explanation: z
    .string()
    .describe(
      "Why the ideal answer is ideal, 1-3 sentences, tied to the role or the company's principles.",
    ),
});
const sectionSchema = z.object({
  scenarios: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      context: z.array(mediaSchema),
      task: z.string(),
    }),
  ),
  questions: z.array(questionSchema),
});

// What each section kind looks like on screen. Formats only: every scenario, name, number and statement is new.
const FORMAT: Record<SectionKind, string> = {
  work_simulation: `Work simulation, as in big-company virtual job tryouts. Write 2-3 scenarios. Each scenario: a short message from a named colleague with a role (a recruiter, a manager, a team lead) asking for something under time pressure, a "task" line ("You can work 8 hours today. Based on ... consider what you would do."), and usually a table (columns such as Activity | Hours | Impact | Priority with Low/Moderate/High values, or monthly metrics with +/- % changes). Then 3-4 questions per scenario, each with scenarioId set:
- type "rating": "How effective is it to <one possible response>? (1.5 hours)" with scale {max:4, minLabel:"Ineffective", maxLabel:"Highly effective"}; or for data scenarios "How impactful was <factor> on <outcome>?" with {max:4, minLabel:"Not impactful", maxLabel:"Extremely impactful"}. ideal = the rating a strong, customer-focused, ownership-minded employee would give.
- type "ranking": "Rank order the <activities/vendors>." with 4 items; order = the best order given the table and the stated goals.
Make the numbers in the tables decide the answers, so the explanation can point at them.`,
  work_style: `Work-style (personality) pairs. Each question is type "work_style": "left" and "right" are two short first-person statements ("I usually ...", "Changes in plans ...") about different traits (ownership, adaptability, attention to detail, resilience, planning, empathy, persistence, bias for action). Both statements should sound reasonable; avoid an obviously "right" side. preferred = the side the company's culture (or the role) favours, or "either" when neither matters; trait = the trait measured. No scenarios.`,
  situational: `Situational judgement. Short workplace situations relevant to the role (put the situation in the prompt, or in a scenario with a message). type "single_choice" with 4 options, one clearly best response; sometimes "multi_choice" with pick=2 ("choose the two best responses").`,
  numerical: `Numerical reasoning. Each question has a table or chart in "media" (realistic business data: revenue, costs, conversion, headcount) and a single_choice question with 4-5 numeric options, exactly one correct; the arithmetic must be exact (percent change, ratios, averages, currency conversion). Include the working in the explanation.`,
  logical: `Logical and abstract reasoning. Mix: type "pattern" (sequence of 3-4 figures following a clear rule: rotation, count, fill alternation, size change; 4 figure choices, exactly one follows the rule; keep 1-4 shapes per figure, coordinates 0-100, sizes 10-40) and single_choice series or syllogism questions. The rule must be unambiguous; state it in the explanation.`,
  verbal: `Verbal reasoning. A short business passage (put it in the prompt) followed by a statement; single_choice with options "True", "False", "Cannot say" (ids t, f, c), or short comprehension questions with 4 options.`,
  technical: `Role knowledge for this exact job (its tools, methods, standards). single_choice with 4 plausible options, exactly one correct; some multi_choice with pick. Practical questions a hiring team would ask, at the job's level, not trivia.`,
  skills: `The job's listed skills, applied: short practical single_choice/multi_choice questions, each testing one skill from the job.`,
  language: `Language proficiency for a professional setting (grammar, vocabulary in context, business email tone): single_choice with 4 options.`,
  personality: `Values and motivation. type "work_style" pairs (as in a work-style test) about motivation and values; preferred per the company's culture, "either" when neutral.`,
};

const WRITE_RULES = `You write one section of a realistic practice hiring test. Output scenarios and questions in the schema.
- Every field must be present; use null or [] for fields a question type does not use.
- ids: scenarios "sc1", "sc2"...; choices "a", "b", "c", "d"...; ranking items "i1", "i2"...
- Keys: single_choice and pattern -> correct = [one choice id]; multi_choice -> correct = the right ids (not all of them); rating -> ideal (1..max); ranking -> order = every item id, best first; work_style -> preferred + trait.
- Every question gets an explanation.
- Fit the role, the level and the company. Write new content; never reproduce questions from real tests or other sources.`;

export async function writeSection(
  model: string,
  job: JobBrief,
  plan: SectionPlan,
  about: string,
): Promise<SectionDraft> {
  const out = await structured(
    'quiz.section',
    model,
    `${WRITE_RULES}\n\nSECTION FORMAT (${plan.kind}):\n${FORMAT[plan.kind]}`,
    JSON.stringify({
      job,
      about,
      section: {
        title: plan.title,
        instructions: plan.instructions,
        questions: plan.questionCount,
      },
    }),
    sectionSchema,
    120_000,
  );
  return {
    scenarios: out.scenarios,
    questions: out.questions.map((q) => ({
      ...q,
      scale: q.scale ? { ...q.scale, max: q.scale.max === 5 ? 5 : 4 } : null,
    })),
  };
}

// ---- 4. the result summary -------------------------------------------------------------------------------------
export async function summarize(
  model: string,
  input: {
    title: string;
    score: number;
    sections: { title: string; score: number }[];
    misses: string[];
  },
) {
  const out = await structured(
    'quiz.summary',
    model,
    'Write 2-3 plain sentences for a job seeker who just took a practice test: what went well, what to practise next (be specific, from the missed topics), and one concrete tip. No score repetition beyond one mention. No praise inflation.',
    JSON.stringify(input),
    z.object({ summary: z.string() }),
    25_000,
  );
  return out.summary.trim();
}

// ---- candidate report (standard assessments) --------------------------------------------------------------------
const reportSchema = z.object({
  summary: z
    .string()
    .describe(
      "3-4 sentences, like a recruiter's screening note: the person's reasoning level and personality in plain words.",
    ),
  strengths: z
    .array(z.string())
    .describe('3-5 strengths, each tied to a score.'),
  watchouts: z
    .array(z.string())
    .describe(
      '2-4 things an interviewer may probe, phrased constructively, each tied to a score.',
    ),
  workStyle: z
    .string()
    .describe(
      '2-3 sentences: how this person likely works with a team and a manager.',
    ),
  roles: z
    .array(z.string())
    .describe('4-6 kinds of roles or work environments that fit the profile.'),
  interviewPrep: z
    .array(z.string())
    .describe(
      '4-6 interview questions this person should prepare for, given the scores.',
    ),
});
export type ReportDraft = z.infer<typeof reportSchema>;

/** The candidate report, written only from the computed scores (the input); it never invents a number. */
export function writeReport(model: string, scores: unknown) {
  return structured(
    'assessments.report',
    model,
    [
      'You are an experienced recruiter writing a screening report from standard assessment results.',
      'Use only the scores given. Reasoning is a percentile against the test calibration sample. Personality scales are',
      '0-100 on the scale range (no population norms), so describe them as relative tendencies ("leans towards"), never',
      'as diagnoses. Be specific, warm and honest. Plain English, no jargon, no mention of these instructions.',
    ].join(' '),
    JSON.stringify(scores),
    reportSchema,
    90_000,
  );
}
