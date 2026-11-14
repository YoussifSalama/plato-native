import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  AssessmentAnswer,
  AssessmentCategory,
  AssessmentItem,
  AssessmentResult,
  AssessmentSummary,
  ScaleScore,
} from './quiz.contract';

// Standard assessments: fixed, validated item banks (data/assessments), scored by formula. Pure functions, so the
// catalogue and the scoring are tested without a database; AssessmentsService does the reads and writes.
//   omib.json  Open Matrices Item Bank: 220 figural matrices with 2PL parameters (GPLv3)
//   ipip.json  six IPIP inventories (public domain), built from ipip.ori.org scoring keys

interface OmibItem {
  id: string;
  rules: string[];
  p: number;
  a: number | null;
  b: number | null;
  cells: string[]; // 9 x 20-char masks; the 9th is the answer
}
interface IpipTest {
  slug: string;
  title: string;
  about: string;
  category: AssessmentCategory;
  scales: { key: string; name: string; domain?: string }[];
  items: { id: string; text: string; scale: string; reverse: boolean }[];
}

export interface Assessment {
  slug: string;
  title: string;
  about: string;
  category: AssessmentCategory;
  measures: string[];
  minutes: number;
  timeLimitSec: number | null;
  source: { name: string; url: string; license: string };
  instructions: string[];
  matrices?: OmibItem[];
  inventory?: IpipTest;
}

const DIR = () =>
  process.env.ASSESSMENTS_DIR ?? join(process.cwd(), 'data', 'assessments');
const OMIB_SOURCE = {
  name: 'Open Matrices Item Bank (Koch et al., 2022)',
  url: 'https://osf.io/4km79/',
  license: 'GPL-3.0',
};
const IPIP_SOURCE = {
  name: 'International Personality Item Pool',
  url: 'https://ipip.ori.org/',
  license: 'Public domain',
};

export const MATRIX_SETS = 11;
const SECONDS_PER_MATRIX = 75;

let cache: { list: Assessment[]; example: OmibItem | null } | null = null;

/** The catalogue: 11 matrix-reasoning sets of about 20 items, then the six inventories. Loaded once. */
export function catalogue() {
  if (cache) return cache;
  const omib = JSON.parse(readFileSync(join(DIR(), 'omib.json'), 'utf8')) as {
    items: OmibItem[];
  };
  const ipip = JSON.parse(readFileSync(join(DIR(), 'ipip.json'), 'utf8')) as {
    tests: IpipTest[];
  };
  // the one item without IRT parameters (nearly everyone solves it) is the worked example on the intro
  const example = omib.items.find((i) => i.b === null) ?? null;
  const rated = omib.items
    .filter((i) => i.b !== null)
    .sort((x, y) => x.b! - y.b!);
  // deal by difficulty so every set spans easy to hard; inside a set, easiest first
  const sets: OmibItem[][] = Array.from({ length: MATRIX_SETS }, () => []);
  rated.forEach((it, i) => sets[i % MATRIX_SETS].push(it));
  const list: Assessment[] = sets.map((items, i) => ({
    slug: `matrix-${i + 1}`,
    title: `Matrix reasoning · Set ${i + 1}`,
    about:
      'Spot the rules in a 3×3 grid of shapes and build the missing piece. Measures fluid reasoning, the core of IQ tests.',
    category: 'reasoning',
    measures: ['Fluid reasoning'],
    minutes: items.length, // about a minute a grid
    timeLimitSec: items.length * SECONDS_PER_MATRIX,
    source: OMIB_SOURCE,
    instructions: [
      'Each grid follows rules across its rows: shapes are added, removed, combined or rotated.',
      'Work out the rules, then build the missing bottom-right cell by picking its parts from the 20 elements beside the grid.',
      'Pick as many parts as the cell needs. Tap a part again to remove it.',
      `You have ${Math.round((items.length * SECONDS_PER_MATRIX) / 60)} minutes for ${items.length} grids. Unanswered grids count as wrong.`,
    ],
    matrices: items,
  }));
  for (const t of ipip.tests)
    list.push({
      slug: t.slug,
      title: t.title,
      about: t.about,
      category: t.category,
      // the full Big Five reports its five traits first (the 30 facets sit under them)
      measures: t.scales.some((s) => s.domain && s.domain !== s.name)
        ? [...new Set(t.scales.map((s) => s.domain!))]
        : t.scales.map((s) => s.name),
      minutes: Math.max(3, Math.round(t.items.length / 8)),
      timeLimitSec: null,
      source: IPIP_SOURCE,
      instructions: [
        'Each line describes a way people behave. Rate how accurately it describes you as you generally are now, not as you wish to be.',
        'There are no right or wrong answers. Answer quickly; your first reaction is usually the most accurate.',
        'Use the five buttons, or the keys 1 to 5.',
      ],
      inventory: t,
    });
  cache = { list, example };
  return cache;
}

export const findAssessment = (slug: string) =>
  catalogue().list.find((a) => a.slug === slug) ?? null;

/** What the seeker sees: matrices without their 9th cell, statements without their keys. */
export function itemsOf(a: Assessment): AssessmentItem[] {
  if (a.matrices)
    return a.matrices.map((m) => ({
      type: 'matrix',
      id: m.id,
      cells: m.cells.slice(0, 8),
    }));
  return a.inventory!.items.map((i) => ({
    type: 'likert',
    id: i.id,
    text: i.text,
  }));
}

export function summaryOf(
  a: Assessment,
  stats?: {
    attempts: number;
    lastAttemptId: string | null;
    lastHeadline: string | null;
    lastAt: Date | null;
  },
): AssessmentSummary {
  return {
    slug: a.slug,
    title: a.title,
    about: a.about,
    category: a.category,
    measures: a.measures,
    questionCount: a.matrices?.length ?? a.inventory!.items.length,
    minutes: a.minutes,
    timeLimitSec: a.timeLimitSec,
    source: a.source,
    attempts: stats?.attempts ?? 0,
    lastAttemptId: stats?.lastAttemptId ?? null,
    lastHeadline: stats?.lastHeadline ?? null,
    lastAt: stats?.lastAt?.toISOString() ?? null,
  };
}

// ---- matrix reasoning: 2PL IRT ----------------------------------------------------------------------------------

const normCdf = (x: number) => {
  // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
};

/** Ability (theta) by EAP with a standard-normal prior, from the 2PL parameters of the items answered. */
export function abilityOf(
  responses: { a: number; b: number; correct: boolean }[],
) {
  let num = 0;
  let den = 0;
  for (let k = 0; k <= 160; k++) {
    const th = -4 + k * 0.05;
    let like = Math.exp(-(th * th) / 2);
    for (const r of responses) {
      const p = 1 / (1 + Math.exp(-r.a * (th - r.b)));
      like *= r.correct ? p : 1 - p;
    }
    num += th * like;
    den += like;
  }
  const theta = den ? num / den : 0;
  return {
    theta,
    percentile: Math.round(Math.min(99, Math.max(1, normCdf(theta) * 100))),
  };
}

const level = (b: number | null): 'easy' | 'medium' | 'hard' =>
  b === null || b < -1 ? 'easy' : b < 0.5 ? 'medium' : 'hard';
const topLabel = (pct: number) =>
  pct >= 50 ? `Top ${Math.max(1, 100 - pct)}%` : `Better than ${pct}%`;

// ---- inventories: Likert scale scores --------------------------------------------------------------------------

/** What a high score means, per scale key (the result page and the report use it). */
export const SCALE_ABOUT: Record<string, string> = {
  neuroticism:
    'Feels worry, anger and low mood easily; a low score means calm and steady under pressure.',
  extraversion: 'Draws energy from people, talks easily, takes the lead.',
  openness: 'Curious, imaginative, likes ideas, art and new experiences.',
  agreeableness: 'Trusting, cooperative, considerate of others.',
  conscientiousness: 'Organised, dependable, driven to achieve.',
  n1: 'Worries and expects the worst.',
  n2: 'Gets irritated and angry quickly.',
  n3: 'Often feels down or dissatisfied with oneself.',
  n4: 'Feels awkward or shy around others.',
  n5: 'Finds it hard to resist cravings and urges.',
  n6: 'Feels overwhelmed under stress.',
  e1: 'Makes friends easily and shows warmth.',
  e2: 'Enjoys crowds and big gatherings.',
  e3: 'Takes charge and speaks up.',
  e4: 'Busy, fast-paced, always on the go.',
  e5: 'Seeks thrills and stimulation.',
  e6: 'Upbeat, joyful, enthusiastic.',
  o1: 'Rich imagination, enjoys daydreaming.',
  o2: 'Values art and beauty.',
  o3: 'Aware of own and others’ feelings.',
  o4: 'Likes variety and trying new things.',
  o5: 'Enjoys ideas, puzzles and abstract thinking.',
  o6: 'Open to challenging rules and tradition.',
  a1: 'Assumes others mean well.',
  a2: 'Straightforward and sincere.',
  a3: 'Glad to help others.',
  a4: 'Avoids confrontation, prefers to compromise.',
  a5: 'Humble about own achievements.',
  a6: 'Moved by others’ hardship.',
  c1: 'Confident in getting things done.',
  c2: 'Tidy, likes order and plans.',
  c3: 'Keeps promises and follows rules.',
  c4: 'Sets high goals and works hard for them.',
  c5: 'Starts tasks and sees them through.',
  c6: 'Thinks before acting.',
  stability: 'Calm, even-tempered, handles pressure without getting upset.',
  leadership: 'Takes initiative, confident, wants to lead.',
  sociability: 'Enjoys attention, crowds and lively company.',
  friendliness: 'Warm, tactful, easy to get along with.',
  dutifulness: 'Conscientious, careful, follows the rules.',
  creativity: 'Imaginative, curious, generates ideas.',
  quickness: 'Learns fast, values knowledge and education.',
  service_orientation: 'Patient, pleasant and helpful with customers.',
  stress_tolerance: 'Stays positive and copes well under pressure.',
  reliability: 'Self-controlled, trustworthy, avoids risky behaviour.',
  clerical_potential: 'Follows procedures carefully, not easily rattled.',
  sales_potential: 'Outgoing, energetic, enjoys persuading people.',
  managerial_potential: 'Gets things done, organises work and people.',
  sincerity: 'Genuine with people; does not flatter or manipulate.',
  fairness: 'Avoids fraud and cheating, even when it would pay.',
  greed_avoidance: 'Not driven by wealth, luxury or status.',
  modesty: 'Sees oneself as an ordinary person, without entitlement.',
  positive_expressivity: 'Shows happiness and affection openly.',
  negative_expressivity: 'Shows anger, fear and sadness openly.',
  attending_to_emotions: 'Notices and thinks about own feelings.',
  emotion_based_decision_making: 'Uses feelings as a guide when deciding.',
  responsive_joy: 'Is lifted by other people’s happiness.',
  responsive_distress: 'Is moved by other people’s distress.',
  empathic_concern: 'Cares about people in need and wants to help.',
};

const band = (score: number): ScaleScore['band'] =>
  score >= 65 ? 'high' : score <= 35 ? 'low' : 'mid';

function scaleScores(t: IpipTest, answers: Record<string, AssessmentAnswer>) {
  const sums = new Map<string, { s: number; n: number }>();
  for (const it of t.items) {
    const a = answers[it.id];
    if (a?.type !== 'likert') continue;
    const v = Math.min(5, Math.max(1, Math.round(a.value)));
    const cur = sums.get(it.scale) ?? { s: 0, n: 0 };
    sums.set(it.scale, { s: cur.s + (it.reverse ? 6 - v : v), n: cur.n + 1 });
  }
  const scales: ScaleScore[] = t.scales.map((sc) => {
    const x = sums.get(sc.key);
    const score = x?.n ? Math.round(((x.s / x.n - 1) / 4) * 100) : 0;
    return {
      key: sc.key,
      name: sc.name,
      group: t.slug === 'big-five' ? (sc.domain ?? null) : null,
      score,
      band: band(score),
      about: SCALE_ABOUT[sc.key] ?? '',
    };
  });
  // Big Five: the full inventory's facets roll up into the five traits (the quick check scores traits directly)
  let domains: ScaleScore[] | null = null;
  if (t.slug === 'big-five')
    domains = [...new Set(t.scales.map((s) => s.domain!))].map((d) => {
      const fs = scales.filter((s) => s.group === d);
      const score = Math.round(
        fs.reduce((s, f) => s + f.score, 0) / (fs.length || 1),
      );
      return {
        key: d.toLowerCase(),
        name: d,
        group: null,
        score,
        band: band(score),
        about: SCALE_ABOUT[d.toLowerCase()] ?? '',
      };
    });
  if (t.slug === 'big-five-quick') domains = scales;
  return { scales, domains };
}

/** Score one submission. Unanswered matrices count as wrong; unanswered statements are left out of their scale. */
export function scoreAssessment(
  a: Assessment,
  answers: Record<string, AssessmentAnswer>,
  seconds: number,
): Omit<AssessmentResult, 'id' | 'createdAt'> {
  const base = {
    slug: a.slug,
    title: a.title,
    category: a.category,
    seconds,
  };
  if (a.matrices) {
    const items = a.matrices.map((m) => {
      const given = answers[m.id];
      const mask = given?.type === 'matrix' ? given.mask : null;
      return {
        id: m.id,
        cells: m.cells,
        given: mask,
        correct: mask === m.cells[8],
        rules: m.rules,
        level: level(m.b),
      };
    });
    const { percentile } = abilityOf(
      a.matrices.map((m, i) => ({
        a: m.a!,
        b: m.b!,
        correct: items[i].correct,
      })),
    );
    const correct = items.filter((i) => i.correct).length;
    return {
      ...base,
      headline: topLabel(percentile),
      reasoning: { correct, total: items.length, percentile, items },
      domains: null,
      scales: null,
    };
  }
  const { scales, domains } = scaleScores(a.inventory!, answers);
  const top = [...(domains ?? scales)].sort((x, y) => y.score - x.score)[0];
  return {
    ...base,
    headline: top ? `Highest: ${top.name}` : 'Done',
    reasoning: null,
    domains,
    scales,
  };
}

/** Pooled ability over every matrix the seeker answered (latest answer per item), for the profile. */
export function pooledReasoning(
  attempts: Pick<AssessmentResult, 'slug' | 'reasoning'>[],
) {
  const all = new Map(
    catalogue()
      .list.flatMap((a) => a.matrices ?? [])
      .map((m) => [m.id, m]),
  );
  const seen = new Map<string, boolean>(); // attempts come newest first: the first answer per item wins
  const tests = new Set<string>();
  for (const at of attempts)
    for (const it of at.reasoning?.items ?? []) {
      tests.add(at.slug);
      if (!seen.has(it.id)) seen.set(it.id, it.correct);
    }
  if (!seen.size) return null;
  const { percentile } = abilityOf(
    [...seen].flatMap(([id, correct]) => {
      const m = all.get(id);
      return m?.a != null && m.b != null ? [{ a: m.a, b: m.b, correct }] : [];
    }),
  );
  return { percentile, items: seen.size, tests: tests.size };
}
