import { Fact, allowedSkills, skillKey } from './resume-facts';
import { WriterOutput } from './resume-ai';
import {
  Check,
  ResumeDoc,
  ResumeProfile,
  ResumeStrategy,
  SectionKey,
} from './resume.types';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-token match: "Node.js" is not found inside "Nodejs-like".
export const mentions = (text: string, skill: string) =>
  new RegExp(`(^|[^a-z0-9+#])${escapeRe(skillKey(skill))}($|[^a-z0-9+#])`).test(
    text.toLowerCase(),
  );
const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

export const SECTION_TITLES: Record<SectionKey, string> = {
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  languages: 'Languages',
};

// Everything the seeker has really said about their work.
function evidenceText(p: ResumeProfile) {
  return [
    p.summary,
    ...p.skills,
    ...p.skillEvidence
      .filter((e) => e.level !== 'LEARNING')
      .flatMap((e) => [e.skill, e.proof]),
    ...p.experiences.flatMap((e) => [
      e.title,
      e.description ?? '',
      ...e.technologies,
    ]),
    ...p.projects.flatMap((x) => [
      x.name,
      x.description,
      x.result ?? '',
      ...x.technologies,
    ]),
    ...p.achievements.map((a) => a.text),
  ].join('\n');
}

// Names people write for the same skill.
const ALIASES: Record<string, string> = {
  html5: 'html',
  css3: 'css',
  js: 'javascript',
  ecmascript: 'javascript',
  node: 'node.js',
  nodejs: 'node.js',
  'express.js': 'express',
  reactjs: 'react',
  'react.js': 'react',
  nextjs: 'next.js',
  'vue.js': 'vue',
  postgres: 'postgresql',
  k8s: 'kubernetes',
  ts: 'typescript',
  'asp.net': '.net',
  'asp.net core': '.net',
  '.net core': '.net',
  'c#': 'c#',
  tailwindcss: 'tailwind',
  'tailwind css': 'tailwind',
};
export const canon = (s: string) => ALIASES[skillKey(s)] ?? skillKey(s);

// What a skill already proves. Someone who ships Next.js writes HTML, CSS and
// JavaScript; asking them to prove those again is noise.
const IMPLIES: Record<string, string[]> = {
  'next.js': ['react', 'javascript', 'html', 'css'],
  react: ['javascript', 'html', 'css'],
  vue: ['javascript', 'html', 'css'],
  svelte: ['javascript', 'html', 'css'],
  angular: ['typescript', 'javascript', 'html', 'css'],
  typescript: ['javascript'],
  'node.js': ['javascript'],
  express: ['node.js', 'javascript'],
  nestjs: ['node.js', 'typescript', 'javascript'],
  tailwind: ['css'],
  postgresql: ['sql'],
  mysql: ['sql'],
  mariadb: ['sql'],
  sqlite: ['sql'],
  kubernetes: ['containers'],
  docker: ['containers'],
};

// Everything the profile proves, aliases and implications included.
export function provenSkills(p: ResumeProfile, extra: string[]): Set<string> {
  const have = new Set<string>();
  const add = (raw: string) => {
    const k = canon(raw);
    if (have.has(k)) return;
    have.add(k);
    for (const implied of IMPLIES[k] ?? []) add(implied);
  };
  for (const s of [
    ...p.skills,
    ...extra,
    ...p.skillEvidence
      .filter((e) => e.level !== 'LEARNING')
      .map((e) => e.skill),
    ...p.experiences.flatMap((e) => e.technologies),
    ...p.projects.flatMap((x) => x.technologies),
  ])
    add(s);
  // A GitHub profile means Git.
  if (p.links.github) add('git');
  return have;
}

// Required skills the profile does not show and nobody has confirmed.
export function findGaps(
  required: string[],
  p: ResumeProfile,
  confirmed: string[],
): string[] {
  const text = evidenceText(p);
  const proven = provenSkills(p, confirmed);
  const seen = new Set<string>();
  return required.filter((skill) => {
    const key = canon(skill);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return !proven.has(key) && !mentions(text, skill);
  });
}

// The claims gate. A bullet survives only if it cites real facts of its own
// entry, adds no number the facts lack, and names no unconfirmed gap skill.
export function buildDoc(
  out: WriterOutput,
  p: ResumeProfile,
  facts: Fact[],
  strategy: ResumeStrategy,
  gaps: string[],
  confirmed: string[],
  tailor: { headline: string; terms: string[] } = { headline: '', terms: [] },
): { doc: ResumeDoc; dropped: number } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const maxBullets =
    strategy.maxPages === 1 ? 3 : strategy.maxPages === 2 ? 4 : 5;
  let dropped = 0;

  const keep = (b: { text: string; facts: string[] }, ref?: string) => {
    const text = b.text.trim();
    const cited = b.facts.map((id) => byId.get(id));
    const ok =
      !!text &&
      text.length <= 300 &&
      cited.length > 0 &&
      cited.every((f) => !!f && (!ref || !f.parent || f.parent === ref)) &&
      numbers(text).every((n) =>
        new Set(cited.flatMap((f) => numbers(f!.text))).has(n),
      ) &&
      !gaps.some((g) => mentions(text, g));
    if (!ok) dropped++;
    return ok;
  };
  const bulletsFor = (ref: string, list: typeof out.experiences) =>
    (list.find((e) => e.ref === ref)?.bullets ?? [])
      .filter((b) => keep(b, ref))
      .map((b) => b.text.trim())
      .slice(0, maxBullets);

  const allowed = allowedSkills(p, confirmed);
  const skills = [
    ...new Set(
      out.skills
        .map((s) => allowed.get(skillKey(s)))
        .filter((s): s is string => !!s),
    ),
  ];
  for (const s of [
    ...p.skillEvidence
      .filter((e) => e.level !== 'LEARNING')
      .map((e) => e.skill),
    ...confirmed,
  ])
    if (!skills.some((x) => skillKey(x) === skillKey(s)))
      skills.push(allowed.get(skillKey(s)) ?? s);

  // ATS matches exact words. Use the posting's spelling for a skill the seeker
  // has ("Node" -> "Node.js") and list job terms the profile proves but the
  // writer left out. Only proven skills are touched.
  const proven = provenSkills(p, confirmed);
  const gapKeys = new Set(gaps.map(canon));
  for (const term of tailor.terms) {
    const key = canon(term);
    if (!key || gapKeys.has(key) || !proven.has(key)) continue;
    const at = skills.findIndex((x) => canon(x) === key);
    if (at >= 0) skills[at] = term;
    else skills.push(term);
  }

  const learning = p.skillEvidence
    .filter((e) => e.level === 'LEARNING')
    .map((e) => e.skill)
    .filter((l) => !skills.some((x) => skillKey(x) === skillKey(l)));

  const summary =
    out.summary && keep(out.summary)
      ? out.summary.text.trim()
      : p.summary.trim();

  const experiences = p.experiences.map((e, i) => ({
    title: e.title,
    company: e.company,
    start: e.start,
    end: e.end,
    bullets: bulletsFor(`exp:${i}`, out.experiences),
  }));
  const projects = p.projects.map((x) => {
    const bullets = bulletsFor(`proj:${x.id}`, out.projects);
    return {
      name: x.name,
      role: x.role,
      url: x.url,
      // The seeker's own description is true by definition.
      bullets: bullets.length ? bullets : [x.description.slice(0, 300)],
    };
  });

  const has: Record<SectionKey, boolean> = {
    summary: !!summary,
    skills: skills.length > 0 || learning.length > 0,
    experience: experiences.length > 0,
    projects: projects.length > 0,
    education: p.educations.length > 0,
    certifications: p.certifications.length > 0,
    languages: p.languages.length > 0,
  };
  return {
    dropped,
    doc: {
      name: p.fullName,
      headline: tailor.headline || p.headline,
      contact: [
        p.email,
        p.phone,
        p.location,
        p.links.linkedin,
        p.links.github,
        p.links.portfolio,
      ].filter((x): x is string => !!x),
      nationality: strategy.nationality ? p.nationality : null,
      sections: strategy.sections.filter((s) => has[s]),
      summary,
      skills,
      learning,
      experiences,
      projects,
      educations: p.educations,
      certifications: p.certifications,
      languages: p.languages,
      template: strategy.template,
      compact: false,
    },
  };
}

// Re-read the finished PDF the way a parser would: the same fields, in order.
export function verifyParsedText(text: string, doc: ResumeDoc): Check[] {
  const flat = text.replace(/\s+/g, ' ').toLowerCase();
  const has = (s: string) =>
    flat.includes(s.replace(/\s+/g, ' ').toLowerCase());
  const missing: string[] = [];
  if (!has(doc.name)) missing.push('name');
  if (doc.contact[0] && !has(doc.contact[0])) missing.push('email');
  for (const e of doc.experiences)
    if (!has(e.company)) missing.push(`company ${e.company}`);

  // Headings are printed in capitals, so a body word like "experience" does
  // not count as one. First occurrence of each, in the order they must appear.
  const upper = text.replace(/\s+/g, ' ');
  let last = -1;
  let inOrder = true;
  for (const s of doc.sections) {
    const at = upper.indexOf(SECTION_TITLES[s].toUpperCase());
    if (at < 0) missing.push(`heading ${SECTION_TITLES[s]}`);
    else {
      if (at < last) inOrder = false;
      last = Math.max(last, at);
    }
  }
  return [
    {
      name: 'parse_fields',
      ok: !missing.length,
      detail: missing.join(', ') || undefined,
    },
    { name: 'parse_order', ok: inOrder },
  ];
}

// What makes this profile weak as a resume source.
export function profileIssues(p: ResumeProfile): string[] {
  const issues: string[] = [];
  if (!p.experiences.length && !p.projects.length)
    issues.push('No work experience or projects listed.');
  if (!p.summary.trim()) issues.push('No professional summary.');
  if (p.skills.length < 3) issues.push('Fewer than 3 skills listed.');
  if (!p.educations.length) issues.push('No education listed.');
  if (!p.links.linkedin && !p.links.github && !p.links.portfolio)
    issues.push('No LinkedIn, GitHub or portfolio link.');
  for (const e of p.experiences) {
    if ((e.description ?? '').trim().length < 40)
      issues.push(
        `${e.title} at ${e.company} has little or no description, so there are no results to show.`,
      );
    if (!e.start) issues.push(`${e.title} at ${e.company} has no start date.`);
  }
  if (!p.projects.length)
    issues.push(
      'No projects saved. Projects show real skills, especially early in a career.',
    );
  if (!p.achievements.some((a) => a.metric))
    issues.push(
      'No achievement with a number (users, time saved, growth). One strong result changes a bullet a lot.',
    );
  return issues;
}
