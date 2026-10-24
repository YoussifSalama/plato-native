import { canon, mentions, provenSkills } from './resume-checks';
import { ResumeDoc, ResumeProfile } from './resume.types';

// ATS software ranks by keyword match, and the job TITLE is the strongest
// keyword. A "Full Stack" CV can be dropped for a "Frontend Developer" job
// even though it proves the work. Everything here is rules over what the
// profile already proves: nothing is added that the evidence does not support.

const FRONTEND = [
  'react',
  'vue',
  'angular',
  'svelte',
  'html',
  'css',
  'javascript',
  'typescript',
  'next.js',
  'tailwind',
];
const BACKEND = [
  'node.js',
  'express',
  'nestjs',
  'java',
  'python',
  '.net',
  'c#',
  'go',
  'php',
  'ruby',
  'sql',
  'postgresql',
  'mysql',
  'mongodb',
  'spring',
];
interface Family {
  name: string;
  title: RegExp;
  skills: string[];
}
const FAMILIES: Family[] = [
  { name: 'full stack', title: /full[\s-]?stack/i, skills: [] }, // special-cased
  {
    name: 'frontend',
    title:
      /front[\s-]?end|\bui\b.*(developer|engineer)|react developer|web developer/i,
    skills: FRONTEND,
  },
  {
    name: 'backend',
    title: /back[\s-]?end|api (developer|engineer)|server[\s-]?side/i,
    skills: BACKEND,
  },
  {
    name: 'mobile',
    title: /mobile|\bios\b|android|flutter|react native/i,
    skills: ['swift', 'kotlin', 'flutter', 'react native', 'dart', 'java'],
  },
  {
    name: 'devops',
    title: /devops|\bsre\b|site reliability|platform engineer|cloud engineer/i,
    skills: [
      'docker',
      'kubernetes',
      'aws',
      'azure',
      'gcp',
      'terraform',
      'linux',
      'ci/cd',
    ],
  },
  {
    name: 'data',
    title: /data (analyst|engineer|scientist)|\bbi\b|business intelligence/i,
    skills: [
      'sql',
      'python',
      'power bi',
      'tableau',
      'excel',
      'pandas',
      'spark',
      'r',
    ],
  },
];

const SENIORITY =
  /\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|mid[\s-]?level|head of)\b/gi;
// Words that say what kind of job, not which field.
const GENERIC = new Set([
  'developer',
  'engineer',
  'manager',
  'specialist',
  'analyst',
  'consultant',
  'associate',
  'executive',
  'officer',
  'assistant',
  'coordinator',
  'and',
  'the',
  'of',
]);

// "Senior Frontend Developer (m/f/d) - Cairo | Acme" -> "Frontend Developer"
export function cleanTitle(raw: string): string {
  const first = raw
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s[-–—|@]\s|,/)[0]
    .replace(SENIORITY, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return first && first === first.toLowerCase()
    ? first.replace(/\b\w/g, (c) => c.toUpperCase())
    : first;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w && !GENERIC.has(w));

export interface Headline {
  text: string;
  // The job title the posting uses, cleaned. Null when no target role.
  jobTitle: string | null;
  // The headline now matches the job title.
  aligned: boolean;
  note: string;
}

// The line under the name. It mirrors the job title only when the profile
// shows that kind of work; otherwise the seeker's own title stays.
export function chooseHeadline(
  p: ResumeProfile,
  targetRole: string | null,
  confirmed: string[] = [],
): Headline {
  const own = p.headline.trim();
  const jobTitle = targetRole ? cleanTitle(targetRole) : null;
  if (!jobTitle) return { text: own, jobTitle: null, aligned: false, note: '' };
  if (own.toLowerCase() === jobTitle.toLowerCase())
    return { text: own, jobTitle, aligned: true, note: '' };

  const proven = provenSkills(p, confirmed);
  // Show the seeker's own spelling of a skill, not the lowercase key.
  const own_ = [
    ...p.skills,
    ...p.experiences.flatMap((e) => e.technologies),
    ...p.projects.flatMap((x) => x.technologies),
  ];
  const label = (key: string) => own_.find((x) => canon(x) === key) ?? key;
  const hits = (skills: string[]) =>
    skills.filter((s) => proven.has(canon(s))).map(label);
  const family = FAMILIES.find((f) => f.title.test(jobTitle));
  let evidence: string[] = [];
  let supported = false;
  if (family?.name === 'full stack') {
    const fe = hits(FRONTEND);
    const be = hits(BACKEND);
    supported = fe.length > 0 && be.length > 0;
    evidence = [...fe.slice(0, 2), ...be.slice(0, 2)];
  } else if (family) {
    evidence = hits(family.skills);
    supported = evidence.length >= 2;
  } else {
    // No known family: a shared field word with a past title is enough
    // ("Marketing Manager" after "Marketing Specialist").
    const target = new Set(words(jobTitle));
    const shared = p.experiences
      .flatMap((e) => words(e.title))
      .filter((w) => target.has(w));
    supported = shared.length > 0;
    evidence = [...new Set(shared)];
  }
  // Their own past titles also count: they held this title or one containing it.
  if (
    !supported &&
    p.experiences.some((e) =>
      e.title.toLowerCase().includes(jobTitle.toLowerCase()),
    )
  )
    supported = true;

  return supported
    ? {
        text: jobTitle,
        jobTitle,
        aligned: true,
        note: `Headline set to "${jobTitle}" to match the job. ${evidence.length ? `Your ${evidence.slice(0, 3).join(', ')} work supports it.` : 'Your history supports it.'}`,
      }
    : {
        text: own,
        jobTitle,
        aligned: false,
        note: `The job is "${jobTitle}", but your profile does not show enough of that work, so the headline stays "${own}". An ATS may rank this CV lower for that title.`,
      };
}

export interface AtsReport {
  // 0-100, requirements counted double.
  score: number;
  // Job terms that appear on the resume.
  matched: string[];
  // Job terms nothing in the profile supports, so they stay off (by design).
  missing: string[];
  headline: Headline;
}

const docText = (d: ResumeDoc, headline: string) =>
  [
    headline,
    d.summary,
    ...d.skills,
    ...d.learning,
    ...d.experiences.flatMap((e) => [e.title, ...e.bullets]),
    ...d.projects.flatMap((x) => [x.name, ...x.bullets]),
  ].join('\n');

// Keyword coverage of the finished resume against the posting.
export function buildAts(
  doc: ResumeDoc,
  headline: Headline,
  job: { required: string[]; preferred: string[]; keywords: string[] } | null,
): AtsReport | null {
  if (!job) return null;
  const terms = new Map<string, { term: string; weight: number }>();
  const add = (list: string[], weight: number) => {
    for (const term of list) {
      const key = canon(term);
      if (!key) continue;
      const have = terms.get(key);
      if (!have || weight > have.weight) terms.set(key, { term, weight });
    }
  };
  add(job.keywords, 1);
  add(job.preferred, 1);
  add(job.required, 2);

  const text = docText(doc, headline.text);
  const skillKeys = new Set([...doc.skills, ...doc.learning].map(canon));
  const matched: string[] = [];
  const missing: string[] = [];
  let got = 0;
  let total = 0;
  for (const [key, { term, weight }] of terms) {
    total += weight;
    if (skillKeys.has(key) || mentions(text, term)) {
      matched.push(term);
      got += weight;
    } else missing.push(term);
  }
  return {
    score: total ? Math.round((100 * got) / total) : 100,
    matched,
    missing,
    headline,
  };
}
