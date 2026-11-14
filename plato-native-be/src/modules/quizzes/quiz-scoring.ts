import type {
  Answer,
  AnswerKey,
  Question,
  QuestionResult,
  Section,
} from './quiz.contract';

// Scoring, on the server only: every question earns 0-1 (partial credit where the format allows it), a section is
// its mean x 100, the quiz is the question-count-weighted mean of its sections.

export interface StoredKey {
  key: AnswerKey;
  explanation: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** One answer against its key. A missing or mismatched answer scores 0. */
export function scoreQuestion(
  q: Question,
  key: AnswerKey,
  a: Answer | null | undefined,
): number {
  if (!a || a.type !== key.type || a.type !== q.type) return 0;
  switch (key.type) {
    case 'single_choice':
      return a.type === 'single_choice' && a.choice === key.correct ? 1 : 0;
    case 'pattern':
      return a.type === 'pattern' && a.choice === key.correct ? 1 : 0;
    case 'multi_choice': {
      if (a.type !== 'multi_choice') return 0;
      // Jaccard: overlap over union, so extra picks and missed ones both cost.
      const picked = new Set(a.choices);
      const correct = new Set(key.correct);
      const union = new Set([...picked, ...correct]);
      if (!union.size) return 0;
      return [...picked].filter((c) => correct.has(c)).length / union.size;
    }
    case 'rating': {
      if (a.type !== 'rating' || q.type !== 'rating') return 0;
      const span = q.scale.max - q.scale.min;
      return span > 0 ? clamp01(1 - Math.abs(a.value - key.ideal) / span) : 0;
    }
    case 'ranking': {
      if (a.type !== 'ranking') return 0;
      const n = key.ideal.length;
      if (n < 2) return 0;
      // Sum of how far each item sits from its ideal place, over the worst possible sum (a full reversal).
      const worst = Math.floor((n * n) / 2);
      let dist = 0;
      for (const [i, id] of key.ideal.entries()) {
        const at = a.order.indexOf(id);
        dist += at < 0 ? n - 1 : Math.abs(at - i);
      }
      return clamp01(1 - dist / worst);
    }
    case 'work_style': {
      if (a.type !== 'work_style') return 0;
      if (key.preferred === 'either') return 1;
      const same = a.side === key.preferred;
      return same
        ? a.strength === 'most'
          ? 1
          : 0.75
        : a.strength === 'more'
          ? 0.25
          : 0;
    }
  }
}

export interface ScoredAttempt {
  score: number; // 0-100
  sections: {
    id: string;
    title: string;
    kind: Section['kind'];
    score: number;
  }[];
  questions: QuestionResult[];
}

/** Every question of the quiz, answered or not, scored and explained. */
export function scoreAttempt(
  sections: Section[],
  keys: Record<string, StoredKey>,
  answers: Record<string, Answer>,
): ScoredAttempt {
  const questions: QuestionResult[] = [];
  const bySection: ScoredAttempt['sections'] = [];
  let total = 0;
  let count = 0;
  for (const s of sections) {
    let sum = 0;
    let n = 0;
    for (const q of s.questions) {
      const k = keys[q.id];
      if (!k) continue; // a question without a key is not scored (should not happen after validation)
      const a = answers[q.id] ?? null;
      const score = scoreQuestion(q, k.key, a);
      questions.push({
        questionId: q.id,
        score,
        answer: a,
        key: k.key,
        explanation: k.explanation,
      });
      sum += score;
      n++;
    }
    if (n)
      bySection.push({
        id: s.id,
        title: s.title,
        kind: s.kind,
        score: Math.round((sum / n) * 100),
      });
    total += sum;
    count += n;
  }
  return {
    score: count ? Math.round((total / count) * 100) : 0,
    sections: bySection,
    questions,
  };
}

/** The summary when the AI one can't be had: plain, from the numbers. */
export function fallbackSummary(r: ScoredAttempt): string {
  if (!r.sections.length) return 'No questions were scored.';
  const sorted = [...r.sections].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const overall =
    r.score >= 75
      ? 'A strong result.'
      : r.score >= 50
        ? 'A solid base with room to grow.'
        : 'There is clear room to improve.';
  if (sorted.length === 1)
    return `${overall} You scored ${best.score} on ${best.title}. Review the explanations below and try again.`;
  return `${overall} Your strongest section was ${best.title} (${best.score}); practise ${worst.title} (${worst.score}) most, starting with the explanations below.`;
}
