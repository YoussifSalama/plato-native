import { ResumeProfile } from './resume.types';

// Every statement the model may use is a numbered fact. A bullet is only
// kept when it cites facts that exist, so nothing can be invented.

export interface Fact {
  id: string;
  text: string;
  // exp:<i> or proj:<id>: the section entry this fact belongs to.
  parent?: string;
}

const same = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export const skillKey = (s: string) => s.trim().toLowerCase();

export function buildFacts(p: ResumeProfile): Fact[] {
  const facts: Fact[] = [];
  if (p.summary.trim())
    facts.push({ id: 'profile:summary', text: p.summary.trim() });

  p.experiences.forEach((e, i) => {
    const parent = `exp:${i}`;
    facts.push({
      id: `${parent}:role`,
      text: `${e.title} at ${e.company}, ${e.start?.slice(0, 7) ?? '?'} to ${e.end?.slice(0, 7) ?? 'present'}`,
      parent,
    });
    if (e.description?.trim())
      facts.push({ id: `${parent}:desc`, text: e.description.trim(), parent });
    if (e.technologies.length)
      facts.push({
        id: `${parent}:tech`,
        text: `Technologies: ${e.technologies.join(', ')}`,
        parent,
      });
    for (const a of p.achievements.filter((x) => same(x.company, e.company)))
      facts.push({
        id: `ach:${a.id}`,
        text: a.metric ? `${a.text} (${a.metric})` : a.text,
        parent,
      });
  });

  for (const pr of p.projects) {
    const parent = `proj:${pr.id}`;
    facts.push({
      id: `${parent}:desc`,
      text: `${pr.name}${pr.role ? `, role: ${pr.role}` : ''}. ${pr.description}`,
      parent,
    });
    if (pr.result)
      facts.push({ id: `${parent}:result`, text: pr.result, parent });
    if (pr.technologies.length)
      facts.push({
        id: `${parent}:tech`,
        text: `Technologies: ${pr.technologies.join(', ')}`,
        parent,
      });
    for (const a of p.achievements.filter((x) => same(x.projectName, pr.name)))
      facts.push({
        id: `ach:${a.id}`,
        text: a.metric ? `${a.text} (${a.metric})` : a.text,
        parent,
      });
  }

  for (const s of p.skills) facts.push({ id: `skill:${skillKey(s)}`, text: s });
  for (const ev of p.skillEvidence.filter((e) => e.level !== 'LEARNING'))
    facts.push({
      id: `ev:${skillKey(ev.skill)}`,
      text: `${ev.skill}: ${ev.proof}`,
    });
  return facts;
}

// Skills a resume may list: the profile's own plus those with real proof.
export function allowedSkills(p: ResumeProfile, extraConfirmed: string[] = []) {
  const map = new Map<string, string>();
  for (const s of [
    ...p.skills,
    ...p.skillEvidence
      .filter((e) => e.level !== 'LEARNING')
      .map((e) => e.skill),
    ...extraConfirmed,
  ])
    map.set(skillKey(s), s);
  return map;
}
