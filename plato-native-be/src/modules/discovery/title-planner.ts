import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import { metered } from '../usage/usage';

// The title someone gives themselves is one keyword. Their history and
// skills usually qualify them for several: a "Software Engineer" who shipped
// React and NestJS can be hired as Full Stack, Frontend or Backend Developer.
// Every search is planned from that evidence, even when they name one title.

export const MAX_TITLES = 8;
const MIN_PLANNED = 4;

export interface TitleEvidence {
  // What the seeker (or the chat agent) asked to search for.
  requested: string[];
  // Desired roles saved in preferences.
  preferenceRoles: string[];
  skills: string[];
  seniority: string | null;
  yearsExperience: string | null;
  experiences: {
    title: string;
    technologies: string[];
    description: string | null;
    start: string | null;
    end: string | null;
  }[];
}

export interface PlannedTitle {
  title: string;
  // Shown to the seeker: which part of their background supports it.
  reason: string;
}

const SENIORITY =
  /^(senior|sr\.?|junior|jr\.?|mid[- ]?level|mid|lead|principal|staff|associate|intern|trainee)\s+/i;

// "Sr. Full-Stack  Developer (Remote)" -> "Full-Stack Developer". Seniority is
// dropped on purpose: ranking against the profile handles level, and a
// level-free title catches postings worded either way.
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s+[-–|@,]\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(SENIORITY, '')
    .trim();
}

const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');

// Requested titles always lead and always survive the cap.
export function mergeTitles(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of groups.flat()) {
    const title = cleanTitle(raw);
    if (title.length < 3 || title.length > 60) continue;
    if (seen.has(key(title))) continue;
    seen.add(key(title));
    out.push(title);
  }
  return out.slice(0, MAX_TITLES);
}

// Teaching / mentoring stints are real history but not what a job search is
// for, unless the seeker asked for them or lists them as a target role.
const OFF_DIRECTION =
  /\b(instructor|teacher|mentor|trainer|lecturer|tutor|teaching assistant)\b/i;

function onDirection(titles: string[], e: TitleEvidence): string[] {
  const wanted = new Set(mergeTitles(e.requested, e.preferenceRoles).map(key));
  return titles.filter((t) => wanted.has(key(t)) || !OFF_DIRECTION.test(t));
}

// No model needed: what they asked for, what they want, what they have been.
export function fallbackTitles(e: TitleEvidence): PlannedTitle[] {
  const requested = new Set(mergeTitles(e.requested).map(key));
  const wanted = new Set(mergeTitles(e.preferenceRoles).map(key));
  return onDirection(
    mergeTitles(
      e.requested,
      e.preferenceRoles,
      e.experiences.map((x) => x.title),
    ),
    e,
  ).map((title) => ({
    title,
    reason: requested.has(key(title))
      ? 'You asked for it'
      : wanted.has(key(title))
        ? 'One of your target roles'
        : 'A role you have held',
  }));
}

// Models like to echo "You asked for it" onto titles nobody asked for.
function honestReason(reason: string | undefined): string | undefined {
  const cleaned = reason
    ?.replace(/^you asked for it\s*(and|plus|,|;|:|-|–)?\s*/i, '')
    .trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : undefined;
}

const planSchema = z.object({
  titles: z.array(z.object({ title: z.string(), reason: z.string() })),
});

const INSTRUCTIONS = `You plan the job titles a job search should use for one person.
You receive what they asked to search for and the evidence of what they can do: past roles with technologies and descriptions, skills, target roles, seniority.

Return 6 to 8 job titles, most relevant first.

Rules:
- Titles must be what EMPLOYERS WRITE ON JOB POSTINGS ("Backend Developer", "Data Engineer"), never skills ("React"), never sentences.
- Always include every requested title, first.
- Cover every distinct role family their history shows (someone who worked as backend dev AND database administrator gets both).
- Add adjacent titles their skills clearly support even if they never held them: a full stack developer with React + Node evidence -> Frontend Developer, Backend Developer; heavy LLM/AI integration work -> AI Engineer; React Native work -> Mobile Developer.
- After the role families, fill up with technology-specific titles employers really post when one technology dominates their work ("Node.js Developer", "React Developer", "NestJS Developer").
- Include common wording variants only when they are really different searches ("Software Engineer" vs "Full Stack Developer"); not trivial respellings ("Fullstack" vs "Full Stack").
- No seniority words (Senior, Junior, Lead). No locations. No company names.
- Only titles the evidence supports. No management, data science, DevOps or design titles unless the history or skills show real work in them.
- Stay in the direction of what was requested: hands-on roles first. Teaching, mentoring or management roles from their history are included only if requested or listed in preferenceRoles.
- reason: at most 12 words, naming the concrete evidence ("3 years React at Acme", "NestJS + PostgreSQL APIs"). Write "You asked for it" ONLY for titles in \`requested\`; never for any other title.`;

// Returns the planned titles; falls back to the deterministic plan on any
// model failure, so a search never blocks on this step.
export async function planTitles(
  model: string,
  evidence: TitleEvidence,
  timeoutMs = 15_000,
): Promise<PlannedTitle[]> {
  const fallback = fallbackTitles(evidence);
  try {
    const agent = new Agent({
      name: 'Search Title Planner',
      instructions: INSTRUCTIONS,
      model,
      outputType: planSchema,
    });
    const input = JSON.stringify({
      ...evidence,
      experiences: evidence.experiences.slice(0, 12).map((x) => ({
        ...x,
        description: x.description?.slice(0, 500) ?? null,
      })),
      skills: evidence.skills.slice(0, 60),
    });
    const result = await Promise.race([
      run(agent, input).then((r) => metered('discovery.titles', model, r)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('title planning timed out')),
          timeoutMs,
        ),
      ),
    ]);
    const planned = result.finalOutput?.titles ?? [];
    const reasons = new Map(
      planned.map((p) => [key(cleanTitle(p.title)), p.reason.trim()]),
    );
    // Requested first, then the model's plan, then history as a safety net
    // if the model came back thin.
    const titles = onDirection(
      mergeTitles(
        evidence.requested,
        planned.map((p) => p.title),
        planned.length < MIN_PLANNED ? fallback.map((f) => f.title) : [],
      ),
      evidence,
    );
    if (!titles.length) return fallback;
    const requested = new Set(mergeTitles(evidence.requested).map(key));
    return titles.map((title) => ({
      title,
      reason: requested.has(key(title))
        ? 'You asked for it'
        : (honestReason(reasons.get(key(title))) ??
          fallback.find((f) => key(f.title) === key(title))?.reason ??
          'Fits your background'),
    }));
  } catch {
    return fallback;
  }
}
