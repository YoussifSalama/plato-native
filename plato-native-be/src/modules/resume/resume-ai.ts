import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { Fact } from './resume-facts';
import { ResumeProfile, ResumeStrategy } from './resume.types';
import { metered } from '../usage/usage';

// The only places the model is used. It reads and rewrites; it never decides
// structure, policy or what is true. Anything it returns passes a code gate.

const jobSchema = z.object({
  required: z.array(z.string()),
  preferred: z.array(z.string()),
  keywords: z.array(z.string()),
  seniority: z.string().nullable(),
  responsibilities: z.array(z.string()),
});
export type JobAnalysis = z.infer<typeof jobSchema>;

const JOB_INSTRUCTIONS = `You read a job posting and list what it asks for.
- Use ONLY what the posting says. Do not add skills the role "usually" needs.
- required: concrete skills, languages, tools and technologies the posting explicitly requires. Short canonical names, e.g. "Node.js", "SQL". Do NOT list practices or soft requirements here ("DevOps practices", "AI-assisted development", "code review", "teamwork", "autonomy"); put those in keywords.
- preferred: those marked as a plus, nice to have or preferred.
- keywords: other exact terms worth mirroring (domain words, methods), as written in the posting.
- seniority: the level the posting asks for (e.g. "junior", "senior", "5+ years"), or null.
- responsibilities: up to 6 short phrases.`;

export async function analyzeJob(
  model: string,
  job: { title: string; company: string; description: string },
): Promise<JobAnalysis> {
  const agent = new Agent({
    name: 'Job Analyzer',
    instructions: JOB_INSTRUCTIONS,
    model,
    outputType: jobSchema,
  });
  const result = metered(
    'resume.analyze',
    model,
    await run(
      agent,
      JSON.stringify({ ...job, description: job.description.slice(0, 5000) }),
    ),
  );
  if (!result.finalOutput) throw new Error('Job analysis returned nothing');
  return result.finalOutput;
}

const bullet = z.object({ text: z.string(), facts: z.array(z.string()) });
const writerSchema = z.object({
  summary: bullet.nullable(),
  skills: z.array(z.string()),
  experiences: z.array(z.object({ ref: z.string(), bullets: z.array(bullet) })),
  projects: z.array(z.object({ ref: z.string(), bullets: z.array(bullet) })),
});
export type WriterOutput = z.infer<typeof writerSchema>;

const WRITER_INSTRUCTIONS = `You write the wording of one resume from a numbered list of verified facts.
Everything you may say is in "facts". Every bullet and the summary must cite the ids of the facts it is built from, in "facts".

Truth rules (never break these):
- Use ONLY the given facts. Never add employers, titles, dates, skills, tools, numbers, results, years or achievements that are not in the facts.
- A number may appear only if it appears in a fact you cite. Never invent or round a metric. If a fact has no number, write the bullet without one.
- Never claim a skill because the job asks for it. List in "skills" only skills that appear in the facts (skill: and ev: facts).
- Never stretch seniority or years of experience.

Style:
- Each bullet: starts with a strong past-tense verb (present tense for the current role), says what was done and, when the facts give it, the result. 1 line, at most 28 words. No pronouns (I, my, we). No filler like "responsible for" or "team player".
- Prefer the facts most relevant to the target role and its requirements. Mirror the posting's exact wording only when the fact says the same thing.
- summary: 2 to 3 sentences, plain, built from facts. Null if the facts do not support one.
- For each entry listed in "experiences" and "projects", return bullets (at most "maxBullets"). If an entry has no usable facts beyond its title, return no bullets for it.
- If "note" is present it is a style hint for this redo (shorter, more about one area). Follow it for wording only; the truth rules above still apply.
- Write in English.`;

export async function writeResume(
  model: string,
  input: {
    profile: ResumeProfile;
    facts: Fact[];
    strategy: ResumeStrategy;
    targetRole: string | null;
    job: { required: string[]; preferred: string[]; keywords: string[] } | null;
    // A style hint for a redo ("shorter", "more about APIs"); truth rules still apply.
    note?: string;
  },
): Promise<WriterOutput> {
  const { profile, facts, strategy } = input;
  const agent = new Agent({
    name: 'Resume Writer',
    instructions: WRITER_INSTRUCTIONS,
    model,
    outputType: writerSchema,
  });
  const payload = {
    target: { role: input.targetRole, job: input.job },
    strategy: { stage: strategy.stage, careerChanger: strategy.careerChanger },
    maxBullets: strategy.maxPages === 1 ? 3 : strategy.maxPages === 2 ? 4 : 5,
    experiences: profile.experiences.map((e, i) => ({
      ref: `exp:${i}`,
      title: e.title,
      company: e.company,
    })),
    projects: profile.projects.map((p) => ({
      ref: `proj:${p.id}`,
      name: p.name,
    })),
    facts,
    ...(input.note && { note: input.note.slice(0, 200) }),
  };
  const result = metered(
    'resume.write',
    model,
    await run(agent, JSON.stringify(payload)),
  );
  if (!result.finalOutput) throw new Error('Resume writer returned nothing');
  return result.finalOutput;
}
