// Resume scores, 0-100, computed by fixed rules (never by the model that writes the
// resume, so the score can't be talked up). Two kinds:
//   quality: the seeker's master resume on its own (scoreProfile);
//   match:   a resume against one job (scoreMatch), built on the ATS keyword report.
// Rubric and thresholds come from what resume checkers publish (Jobscan's 75% match
// target, Resume Worded's "85+ is good") and recruiter studies (title, dates and
// numbers get read first). They are rules of thumb, not an employer's verdict: Plato
// never says a resume "passes an ATS". See docs/resume-scoring.md.
import type { AtsReport } from './resume-ats';
import { mentions } from './resume-checks';
import type { ResumeDoc, ResumeProfile } from './resume.types';

export type ScoreBand = 'strong' | 'good' | 'fair' | 'needs_work';

export const SCORE_BANDS = { strong: 85, good: 75, fair: 60 } as const;
// When a job resume is good enough to send without asking, and when the master
// resume is weak enough that Plato should say so.
export const THRESHOLDS = {
  autoApply: 75,
  confirm: 65,
  masterWarn: 70,
} as const;

export const bandOf = (n: number): ScoreBand =>
  n >= SCORE_BANDS.strong
    ? 'strong'
    : n >= SCORE_BANDS.good
      ? 'good'
      : n >= SCORE_BANDS.fair
        ? 'fair'
        : 'needs_work';

// What Plato may do with a resume for one job, by its match score.
export type SendDecision = 'send' | 'confirm' | 'hold';
export const sendDecision = (match: number): SendDecision =>
  match >= THRESHOLDS.autoApply
    ? 'send'
    : match >= THRESHOLDS.confirm
      ? 'confirm'
      : 'hold';

export interface ScoreCategory {
  key: string;
  label: string;
  score: number;
  max: number;
  // What would raise it, in plain words. Empty when it is full.
  tips: string[];
}
export interface ResumeScore {
  score: number;
  band: ScoreBand;
  categories: ScoreCategory[];
  // The three changes worth the most points, biggest first.
  topFixes: string[];
  // Quality score only: the seeker's own bullets that carry no number, to quote
  // in a suggestion ("Led ERP rollout" becomes stronger with how many sites...).
  bulletsWithoutNumbers?: { count: number; examples: string[] };
}

const round = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// A number, percentage, money or a span of time: the evidence recruiters look for.
const QUANT =
  /(\d|%|\$|€|£|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozens?|hundreds?|thousands?|millions?)\b)/i;

const VERBS = new Set(
  'led lead built build launched delivered designed developed created managed owned drove cut reduced increased grew improved implemented migrated automated shipped scaled rolled ran negotiated closed won saved trained mentored coached hired established streamlined optimized optimised architected engineered analyzed analysed planned coordinated directed spearheaded introduced transformed achieved generated secured expanded restructured redesigned consolidated resolved accelerated boosted produced wrote authored presented partnered supported deployed integrated configured maintained modernized modernised standardized standardised oversaw headed initiated piloted'.split(
    ' ',
  ),
);
const BUZZ =
  /\b(hard[- ]working|team player|go[- ]getter|detail[- ]oriented|results[- ]driven|self[- ]starter|synergy|think outside the box|dynamic|passionate|motivated|best of breed|responsible for)\b/i;
const FIRST_PERSON = /\b(I|my|me)\b/;

// A role's description as bullets: lines, bullet marks or sentences.
export function bulletsOf(text: string | null | undefined): string[] {
  if (!text) return [];
  const lines = text
    .split(/\n|•|▪|●|(?:^|\s)[-*–]\s/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parts =
    lines.length > 1
      ? lines
      : text.split(/(?<=[.;])\s+(?=[A-Z])/).map((l) => l.trim());
  return parts.filter((l) => words(l) >= 3);
}

const months = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(+d) ? null : d.getFullYear() * 12 + d.getMonth();
};

const cat = (
  key: string,
  label: string,
  max: number,
  parts: { got: number; tip?: string; worth: number }[],
): ScoreCategory => {
  const score = round(parts.reduce((n, p) => n + p.got, 0));
  // Tips for the parts that lost the most points.
  const tips = parts
    .filter((p) => p.tip && p.worth - p.got >= 0.5)
    .sort((a, b) => b.worth - b.got - (a.worth - a.got))
    .map((p) => p.tip!);
  return { key, label, score: Math.min(max, score), max, tips };
};

const finish = (categories: ScoreCategory[]): ResumeScore => {
  const score = Math.round(categories.reduce((n, c) => n + c.score, 0));
  const topFixes = categories
    .flatMap((c) => c.tips.map((t) => ({ t, lost: c.max - c.score })))
    .sort((a, b) => b.lost - a.lost)
    .map((x) => x.t)
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 3);
  return { score, band: bandOf(score), categories, topFixes };
};

/** The master resume on its own: is it complete, specific, readable? */
export function scoreProfile(p: ResumeProfile): ResumeScore {
  // A partial profile (an old row, a missing section) scores as empty, never throws.
  p = {
    ...p,
    headline: p.headline ?? '',
    summary: p.summary ?? '',
    skills: p.skills ?? [],
    links: p.links ?? {},
    experiences: p.experiences ?? [],
    educations: p.educations ?? [],
    projects: p.projects ?? [],
    achievements: p.achievements ?? [],
  };
  const roles = p.experiences;
  const bullets = [
    ...roles.flatMap((r) => bulletsOf(r.description)),
    ...p.achievements.map((a) => a.text),
  ];
  const share = (f: (b: string) => boolean) =>
    bullets.length ? bullets.filter(f).length / bullets.length : 0;

  // 1. Contact and structure (15)
  const contact = [
    p.fullName,
    p.email,
    p.phone,
    p.location,
    p.links.linkedin,
  ].filter(Boolean).length;
  const sections = [
    p.headline,
    p.summary,
    roles.length,
    p.skills.length,
    p.educations.length,
  ].filter(Boolean).length;
  const dated = roles.length
    ? roles.filter((r) => r.start).length / roles.length
    : 0;
  const starts = roles
    .map((r) => months(r.start))
    .filter((m): m is number => m !== null);
  const ordered = starts.every((m, i) => i === 0 || m <= starts[i - 1]);
  const structure = cat('structure', 'Contact and sections', 15, [
    {
      got: contact,
      worth: 5,
      tip: !p.links.linkedin
        ? 'Add your LinkedIn link.'
        : 'Add your phone and city.',
    },
    {
      got: sections,
      worth: 5,
      tip: 'Fill in the missing sections: headline, summary, experience, skills and education.',
    },
    {
      got: 3 * dated + (ordered ? 2 : 0),
      worth: 5,
      tip: 'Give every role a start and end month, newest first.',
    },
  ]);

  // 2. Quantified impact (25): full credit when half the bullets carry a number.
  const quant = share((b) => QUANT.test(b));
  const impact = cat('impact', 'Numbers and results', 25, [
    {
      got: 25 * clamp01(quant / 0.5),
      worth: 25,
      tip: `Add a number to more bullets (users, sites, %, time or money saved): ${Math.round(quant * 100)}% have one, aim for half.`,
    },
  ]);

  // 3. Action verbs and style (15)
  const verb = share((b) =>
    VERBS.has(
      b
        .split(/\s+/)[0]
        ?.toLowerCase()
        .replace(/[^a-z]/g, '') ?? '',
    ),
  );
  const firstPerson =
    bullets.some((b) => FIRST_PERSON.test(b)) || FIRST_PERSON.test(p.summary);
  const buzz = [p.summary, ...bullets].some((b) => BUZZ.test(b));
  const style = cat('style', 'Action verbs and style', 15, [
    {
      got: 10 * clamp01(verb / 0.7),
      worth: 10,
      tip: 'Start each bullet with a strong verb (Led, Built, Cut, Launched).',
    },
    {
      got: firstPerson ? 0 : 3,
      worth: 3,
      tip: 'Drop "I" and "my" from bullets and summary.',
    },
    {
      got: buzz ? 0 : 2,
      worth: 2,
      tip: 'Replace filler like "results-driven" or "responsible for" with what you did.',
    },
  ]);

  // 4. Brevity (10): 3-6 bullets on recent roles, 8-30 words a bullet.
  const recent = roles.slice(0, 2).map((r) => bulletsOf(r.description).length);
  const perRole = recent.length
    ? recent.filter((n) => n >= 3 && n <= 6).length / recent.length
    : 0;
  const sized = share((b) => words(b) >= 8 && words(b) <= 30);
  const brevity = cat('brevity', 'Length and bullets', 10, [
    {
      got: 5 * perRole,
      worth: 5,
      tip: 'Give your last two roles 3 to 6 bullets each.',
    },
    { got: 5 * sized, worth: 5, tip: 'Keep bullets between 8 and 30 words.' },
  ]);

  // 5. Headline and summary (10)
  const hw = words(p.headline);
  const sw = words(p.summary);
  const intro = cat('intro', 'Headline and summary', 10, [
    {
      got: hw > 0 && hw <= 8 ? 4 : hw > 0 ? 2 : 0,
      worth: 4,
      tip: 'Use a short headline that reads like a job title.',
    },
    {
      got: sw >= 30 && sw <= 80 ? 6 : sw >= 15 && sw <= 120 ? 3 : 0,
      worth: 6,
      tip: 'Write a 2-3 sentence summary (30-80 words): your role, years, and strongest results.',
    },
  ]);

  // 6. Skills (15): 8-25 of them, at least half shown in the experience.
  const story = [
    ...roles.flatMap((r) => [r.title, r.description ?? '', ...r.technologies]),
    ...p.projects.flatMap((x) => [x.name, x.description, ...x.technologies]),
    ...p.achievements.map((a) => a.text),
  ].join('\n');
  const shown = p.skills.length
    ? p.skills.filter((s) => mentions(story, s)).length / p.skills.length
    : 0;
  const n = p.skills.length;
  const skills = cat('skills', 'Skills backed by experience', 15, [
    {
      got: n >= 8 && n <= 25 ? 7 : n >= 4 ? 4 : n ? 2 : 0,
      worth: 7,
      tip:
        n > 25
          ? 'Trim your skills to the 8-25 that matter most.'
          : 'List 8 to 25 hard skills.',
    },
    {
      got: 8 * clamp01(shown / 0.5),
      worth: 8,
      tip: 'Show your key skills in your experience bullets, not only in the skills list.',
    },
  ]);

  // 7. Experience coherence (10): titles and companies; gaps over 6 months flagged.
  const complete = roles.length
    ? roles.filter((r) => r.title && r.company).length / roles.length
    : 0;
  let gaps = 0;
  const spans = roles
    .map((r) => ({
      s: months(r.start),
      e: months(r.end) ?? months(new Date().toISOString()),
    }))
    .filter((x): x is { s: number; e: number } => x.s !== null && x.e !== null)
    .sort((a, b) => b.s - a.s);
  for (let i = 1; i < spans.length; i++)
    if (spans[i - 1].s - spans[i].e > 6) gaps++;
  const coherence = cat('coherence', 'Experience', 10, [
    {
      got: 5 * complete,
      worth: 5,
      tip: 'Give every role a title and a company.',
    },
    {
      got: Math.max(0, 5 - 2.5 * gaps),
      worth: 5,
      tip: 'Explain gaps over 6 months in a line (study, family, freelance).',
    },
  ]);

  const plain = bullets.filter((b) => !QUANT.test(b));
  return {
    ...finish([structure, impact, style, brevity, intro, skills, coherence]),
    bulletsWithoutNumbers: { count: plain.length, examples: plain.slice(0, 3) },
  };
}

/**
 * One resume against one job. Requirements weigh double in the ATS report already;
 * a term only in the skills list counts less than one shown in the experience.
 */
export function scoreMatch(
  doc: ResumeDoc,
  ats: AtsReport,
  job: { title: string },
  quality: number,
): ResumeScore {
  // A stored doc from an older shape may lack bullets: treat as none.
  const exp = (doc.experiences ?? []).map((e) => ({
    ...e,
    bullets: e.bullets ?? [],
  }));
  const story = exp.flatMap((e) => [e.title, ...e.bullets]).join('\n');
  const recentText = exp
    .slice(0, 2)
    .flatMap((e) => [e.title, ...e.bullets])
    .join('\n');
  const matched = ats.matched ?? [];
  const missing = ats.missing ?? [];
  const atsScore = ats.score ?? 0;
  const inStory = matched.length
    ? matched.filter((t) => mentions(story, t)).length / matched.length
    : 0;
  const inRecent = matched.length
    ? matched.filter((t) => mentions(recentText, t)).length / matched.length
    : 0;

  const tokens = (s: string | null | undefined) =>
    new Set(
      (s ?? '')
        .toLowerCase()
        .split(/[^a-z0-9+#]+/)
        .filter((w) => w.length > 2),
    );
  const want = tokens(job.title);
  const overlap = (s: string | null | undefined) =>
    want.size
      ? [...tokens(s)].filter((w) => want.has(w)).length / want.size
      : 0;
  const titleFit = ats.headline?.aligned
    ? 1
    : Math.max(overlap(doc.headline), overlap(exp[0]?.title ?? ''));

  const coverage = cat('keywords', 'Job keywords', 50, [
    {
      got: 50 * (atsScore / 100),
      worth: 50,
      tip: missing.length
        ? `The job asks for ${missing.slice(0, 3).join(', ')}. Add one only if you have done it (a project or a confirmed skill).`
        : undefined,
    },
  ]);
  const title = cat('title', 'Job title', 15, [
    {
      got: 15 * titleFit,
      worth: 15,
      tip: `Your headline and latest title don't read like "${job.title}". A real project in that work changes it.`,
    },
  ]);
  const evidence = cat('evidence', 'Shown in your experience', 15, [
    {
      got: 15 * (0.7 + 0.3 * inStory) * (matched.length ? 1 : 0),
      worth: 15,
      tip: 'Mention the matched skills in your experience bullets, not only the skills list.',
    },
  ]);
  const recency = cat('recency', 'Recent experience', 10, [
    {
      got: 10 * clamp01(inRecent / 0.6),
      worth: 10,
      tip: 'Bring the work closest to this job into your last two roles.',
    },
  ]);
  const floor = cat('quality', 'Resume quality', 10, [
    {
      got: quality / 10,
      worth: 10,
      tip: 'Raise the master resume score (see its fixes).',
    },
  ]);
  // Never 100 from keywords alone: the categories cap each other.
  return finish([coverage, title, evidence, recency, floor]);
}
