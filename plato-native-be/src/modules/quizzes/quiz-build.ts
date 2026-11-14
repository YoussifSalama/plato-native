import type {
  AnswerKey,
  Choice,
  Figure,
  Media,
  Question,
  QuestionType,
  QuizDetail,
  QuizSummary,
  Scenario,
  Section,
  SectionKind,
} from './quiz.contract';
import type { StoredKey } from './quiz-scoring';

// From the AI's drafts to the contract: one flat draft per question (every field present, unused ones empty, which
// structured outputs handle more reliably than a union), converted, validated and given stable ids. Invalid
// questions are dropped, never repaired by guessing.

// ---- drafts (what the section writer returns) ------------------------------------------------------------------
export interface MediaDraft {
  kind: 'message' | 'table' | 'chart';
  from: string | null;
  role: string | null;
  body: string | null;
  caption: string | null;
  columns: string[];
  rows: string[][];
  legend: string | null;
  title: string | null;
  chart: 'bar' | 'line' | null;
  labels: string[];
  series: { name: string; values: number[] }[];
  unit: string | null;
}
export interface FigureDraft {
  shapes: {
    shape: Figure['shapes'][number]['shape'];
    x: number;
    y: number;
    size: number;
    rotation: number | null;
    fill: 'none' | 'solid' | 'striped' | 'dotted' | null;
  }[];
}
export interface QuestionDraft {
  type: QuestionType;
  scenarioId: string | null;
  prompt: string | null;
  media: MediaDraft[];
  choices: { id: string; text: string | null; figure: FigureDraft | null }[];
  items: { id: string; text: string }[];
  pick: number | null;
  scale: { max: 4 | 5; minLabel: string; maxLabel: string } | null;
  left: string | null;
  right: string | null;
  sequence: FigureDraft[];
  // the key
  correct: string[]; // single_choice / pattern: one id; multi_choice: several
  ideal: number | null; // rating
  order: string[]; // ranking: item ids, best first
  preferred: 'left' | 'right' | 'either' | null; // work_style
  trait: string | null; // work_style
  explanation: string;
}
export interface SectionDraft {
  scenarios: {
    id: string;
    title: string;
    context: MediaDraft[];
    task: string;
  }[];
  questions: QuestionDraft[];
}

const SHAPES = new Set([
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
]);
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
const text = (s: string | null | undefined) => (s ?? '').trim();

export function toMedia(m: MediaDraft): Media | null {
  if (m.kind === 'message')
    return text(m.body)
      ? {
          kind: 'message',
          from: text(m.from) || 'A colleague',
          role: text(m.role) || null,
          body: text(m.body),
        }
      : null;
  if (m.kind === 'table') {
    const columns = m.columns.map(text).filter(Boolean);
    const rows = m.rows
      .filter((r) => r.length === columns.length)
      .map((r) => r.map(text));
    return columns.length >= 2 && rows.length
      ? {
          kind: 'table',
          caption: text(m.caption) || null,
          columns,
          rows,
          legend: text(m.legend) || null,
        }
      : null;
  }
  const labels = m.labels.map(text).filter(Boolean);
  const series = m.series.filter(
    (s) => s.values.length === labels.length && s.values.every(Number.isFinite),
  );
  return labels.length >= 2 && series.length
    ? {
        kind: 'chart',
        title: text(m.title) || null,
        chart: m.chart ?? 'bar',
        labels,
        series,
        unit: text(m.unit) || null,
      }
    : null;
}

export function toFigure(f: FigureDraft | null): Figure | null {
  const shapes = (f?.shapes ?? [])
    .filter((s) => SHAPES.has(s.shape))
    .map((s) => ({
      shape: s.shape,
      x: clamp(s.x, 0, 100),
      y: clamp(s.y, 0, 100),
      size: clamp(s.size, 5, 60),
      ...(s.rotation ? { rotation: s.rotation % 360 } : {}),
      ...(s.fill ? { fill: s.fill } : {}),
    }));
  return shapes.length ? { shapes } : null;
}

const unique = (ids: string[]) => new Set(ids).size === ids.length;

/** One draft as a contract question and its key, or null when it would not work on screen or could not be scored. */
export function toQuestion(
  d: QuestionDraft,
  id: string,
  scenarioIds: Set<string>,
): { question: Question; key: StoredKey } | null {
  const scenarioId =
    d.scenarioId && scenarioIds.has(d.scenarioId) ? d.scenarioId : null;
  const media = d.media.map(toMedia).filter((m): m is Media => !!m);
  const base = {
    id,
    ...(scenarioId && { scenarioId }),
    ...(media.length && { media }),
  };
  const explanation = text(d.explanation);
  if (!explanation) return null;
  const prompt = text(d.prompt);
  const k = (key: AnswerKey) => ({ key, explanation });
  switch (d.type) {
    case 'single_choice':
    case 'multi_choice': {
      const choices: Choice[] = d.choices
        .map((c) => ({ id: text(c.id), text: text(c.text) || null }))
        .filter((c) => c.id && c.text);
      const ids = choices.map((c) => c.id);
      const correct = [...new Set(d.correct.map(text))];
      if (
        !prompt ||
        choices.length < 2 ||
        !unique(ids) ||
        !correct.length ||
        !correct.every((c) => ids.includes(c))
      )
        return null;
      if (d.type === 'single_choice')
        return correct.length === 1
          ? {
              question: { ...base, type: 'single_choice', prompt, choices },
              key: k({ type: 'single_choice', correct: correct[0] }),
            }
          : null;
      if (correct.length === ids.length) return null; // "pick them all" teaches nothing
      return {
        question: {
          ...base,
          type: 'multi_choice',
          prompt,
          choices,
          ...(d.pick ? { pick: d.pick } : {}),
        },
        key: k({ type: 'multi_choice', correct }),
      };
    }
    case 'rating': {
      const max = d.scale?.max === 5 ? 5 : 4;
      if (
        !prompt ||
        !d.scale ||
        d.ideal === null ||
        !Number.isInteger(d.ideal) ||
        d.ideal < 1 ||
        d.ideal > max
      )
        return null;
      return {
        question: {
          ...base,
          type: 'rating',
          prompt,
          scale: {
            min: 1,
            max,
            minLabel: text(d.scale.minLabel) || 'Low',
            maxLabel: text(d.scale.maxLabel) || 'High',
          },
        },
        key: k({ type: 'rating', ideal: d.ideal }),
      };
    }
    case 'ranking': {
      const items = d.items
        .map((i) => ({ id: text(i.id), text: text(i.text) }))
        .filter((i) => i.id && i.text);
      const ids = items.map((i) => i.id);
      const order = d.order.map(text);
      // the key must be exactly the items, each once
      if (
        !prompt ||
        items.length < 3 ||
        !unique(ids) ||
        order.length !== ids.length ||
        !unique(order) ||
        !order.every((o) => ids.includes(o))
      )
        return null;
      return {
        question: { ...base, type: 'ranking', prompt, items },
        key: k({ type: 'ranking', ideal: order }),
      };
    }
    case 'work_style': {
      const left = text(d.left);
      const right = text(d.right);
      if (!left || !right || left === right || !d.preferred) return null;
      return {
        question: { ...base, type: 'work_style', left, right },
        key: k({
          type: 'work_style',
          preferred: d.preferred,
          trait: text(d.trait) || 'work style',
        }),
      };
    }
    case 'pattern': {
      const sequence = d.sequence.map(toFigure).filter((f): f is Figure => !!f);
      const choices: Choice[] = d.choices
        .map((c) => ({ id: text(c.id), figure: toFigure(c.figure) }))
        .filter((c) => c.id && c.figure);
      const ids = choices.map((c) => c.id);
      const correct = text(d.correct[0]);
      if (
        !prompt ||
        sequence.length < 2 ||
        choices.length < 3 ||
        !unique(ids) ||
        !ids.includes(correct)
      )
        return null;
      return {
        question: { ...base, type: 'pattern', prompt, sequence, choices },
        key: k({ type: 'pattern', correct }),
      };
    }
  }
}

export interface SectionPlan {
  kind: SectionKind;
  title: string;
  instructions: string;
  questionCount: number;
  timeLimitMin: number | null;
}

/** A written section, validated: stable ids (s1-q1), scenarios that no question uses dropped. Empty = null. */
export function buildSection(
  index: number,
  plan: SectionPlan,
  draft: SectionDraft,
): { section: Section; keys: Record<string, StoredKey> } | null {
  const sid = `s${index + 1}`;
  const scenarios: Scenario[] = [];
  const scenarioIdMap = new Map<string, string>();
  for (const sc of draft.scenarios) {
    const context = sc.context.map(toMedia).filter((m): m is Media => !!m);
    if (!text(sc.task) || !context.length || scenarioIdMap.has(sc.id)) continue;
    const id = `${sid}-sc${scenarios.length + 1}`;
    scenarioIdMap.set(sc.id, id);
    scenarios.push({
      id,
      title: text(sc.title) || 'Scenario',
      context,
      task: text(sc.task),
    });
  }
  const known = new Set(scenarios.map((s) => s.id));
  const questions: Question[] = [];
  const keys: Record<string, StoredKey> = {};
  for (const q of draft.questions) {
    const mapped = {
      ...q,
      scenarioId: q.scenarioId
        ? (scenarioIdMap.get(q.scenarioId) ?? null)
        : null,
    };
    const built = toQuestion(mapped, `${sid}-q${questions.length + 1}`, known);
    if (!built) continue;
    questions.push(built.question);
    keys[built.question.id] = built.key;
  }
  if (!questions.length) return null;
  const used = new Set(questions.map((q) => q.scenarioId).filter(Boolean));
  return {
    section: {
      id: sid,
      kind: plan.kind,
      title: plan.title,
      instructions: plan.instructions,
      timeLimitSec: plan.timeLimitMin
        ? Math.round(plan.timeLimitMin * 60)
        : null,
      scenarios: scenarios.filter((s) => used.has(s.id)),
      questions,
    },
    keys,
  };
}

// ---- library and mapping ---------------------------------------------------------------------------------------

const LEVELS =
  /\b(senior|sr|junior|jr|lead|principal|staff|head|chief|associate|intern|trainee|graduate|entry level|mid level|i{1,3}|iv|[1-4])\b/g;

/** The role without level or noise, so "Senior Software Development Engineer II" and "SDE" share a library entry. */
export function roleFamily(role: string): string {
  const r = role
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[-–—|/,:.]+/g, ' ')
    .replace(LEVELS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ALIAS: Record<string, string> = {
    sde: 'software development engineer',
    swe: 'software engineer',
    pm: 'product manager',
    ba: 'business analyst',
  };
  return ALIAS[r] ?? r;
}

export const LIBRARY_FRESH_DAYS = 60;

/** The library entry to reuse: same company and role family, newest, younger than 60 days. */
export function pickLibrary<
  T extends { company_key: string; role_family: string; created_at: Date },
>(rows: T[], companyKey: string, family: string, now = Date.now()): T | null {
  return (
    rows
      .filter(
        (r) =>
          r.company_key === companyKey &&
          r.role_family === family &&
          now - r.created_at.getTime() < LIBRARY_FRESH_DAYS * 86_400_000,
      )
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ??
    null
  );
}

interface QuizRow {
  id: string;
  title: string;
  company: string | null;
  role: string;
  status: string;
  stage: string | null;
  about: string;
  sources: unknown;
  sections: unknown;
  library_id?: string | null;
  created_at: Date;
}

const minutesOf = (sections: Section[]) =>
  Math.max(
    1,
    Math.round(
      sections.reduce(
        (m, s) =>
          m +
          (s.timeLimitSec
            ? s.timeLimitSec / 60
            : s.questions.length * (s.kind === 'work_style' ? 0.25 : 1)),
        0,
      ),
    ),
  );

export function toSummary(
  q: QuizRow,
  stats: {
    best: number | null;
    attempts: number;
    lastAttemptId?: string | null;
  } = {
    best: null,
    attempts: 0,
  },
  fromLibrary = false,
): QuizSummary {
  const sections = (q.sections as Section[]) ?? [];
  return {
    id: q.id,
    title: q.title,
    company: q.company,
    role: q.role,
    status: q.status as QuizSummary['status'],
    stage: (q.status === 'generating' ? q.stage : null) as QuizSummary['stage'],
    questionCount: sections.reduce((n, s) => n + s.questions.length, 0),
    minutes: sections.length ? minutesOf(sections) : 0,
    sections: sections.map((s) => ({
      kind: s.kind,
      title: s.title,
      questions: s.questions.length,
    })),
    bestScore: stats.best,
    attempts: stats.attempts,
    lastAttemptId: stats.lastAttemptId ?? null,
    createdAt: q.created_at.toISOString(),
    ...(fromLibrary && { fromLibrary: true }),
  };
}

/** The quiz as the seeker sees it while taking it: questions only. Keys and explanations never leave the server here. */
export function toDetail(
  q: QuizRow,
  stats?: {
    best: number | null;
    attempts: number;
    lastAttemptId?: string | null;
  },
): QuizDetail {
  const sections = ((q.sections as Section[]) ?? []).map((s) => ({
    ...s,
    questions: s.questions.map(stripKey),
  }));
  const { sections: _summarySections, ...summary } = toSummary(q, stats);
  void _summarySections;
  return {
    ...summary,
    about: q.about,
    sources: (q.sources as QuizDetail['sources']) ?? [],
    sections,
    history: [],
  };
}

// Defence in depth: whatever a stored question might carry, only contract fields go out.
function stripKey(q: Question): Question {
  const {
    key: _k,
    explanation: _e,
    correct: _c,
    ideal: _i,
    order: _o,
    preferred: _p,
    trait: _t,
    ...rest
  } = q as Question & Record<string, unknown>;
  void [_k, _e, _c, _i, _o, _p, _t];
  return rest;
}
