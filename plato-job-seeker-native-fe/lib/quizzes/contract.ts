// Quiz Builder wire contract: a copy of the backend's plato-native-be/src/modules/quizzes/quiz.contract.ts. Keep the two identical.
// Keep the two files identical. Answer keys and explanations live only on the server until an attempt is submitted.
//
// A quiz simulates a company's real hiring test for one role: sections in the company's own format (Amazon: Work
// Simulation + Work Style), each with scenarios (messages, tables, charts) and questions of these types.

// ---- shared visuals ---------------------------------------------------------------------------------------------

/** One part of a scenario: a message from a colleague, a data table, or a chart. */
export type Media =
  | { kind: "message"; from: string; role?: string | null; body: string } // body keeps line breaks
  | {
      kind: "table"
      caption?: string | null
      columns: string[]
      rows: string[][]
      legend?: string | null
    }
  | {
      kind: "chart"
      title?: string | null
      chart: "bar" | "line"
      labels: string[]
      series: { name: string; values: number[] }[]
      unit?: string | null
    }

/** A situation several questions refer to (Work Simulation): who wrote, what is going on, what to do. */
export interface Scenario {
  id: string
  title: string // "Last-minute candidate interview"
  context: Media[] // usually a message, often a table
  task: string // "Based on your current workload... consider what action you would take."
}

/** A drawable figure for pattern questions: a few shapes in a 100x100 box. */
export interface Figure {
  shapes: {
    shape: "circle" | "square" | "rectangle" | "triangle" | "diamond" | "hexagon" | "star" | "arrow" | "line" | "cross"
    x: number // centre, 0-100
    y: number // centre, 0-100
    size: number // 5-60
    rotation?: number // degrees
    fill?: "none" | "solid" | "striped" | "dotted"
  }[]
}

export interface Choice {
  id: string // "a", "b", ...
  text?: string | null
  figure?: Figure | null // pattern options are figures
}

// ---- questions (what the seeker sees) ---------------------------------------------------------------------------

interface QuestionBase {
  id: string
  scenarioId?: string | null // shows that scenario beside the question
  media?: Media[] // extra table/chart for this question only
}

export type Question =
  | (QuestionBase & {
      type: "single_choice"
      prompt: string
      choices: Choice[]
    })
  | (QuestionBase & {
      type: "multi_choice"
      prompt: string
      choices: Choice[]
      pick?: number | null
    }) // pick: how many to choose, if fixed
  // Work Simulation: rate one response on a scale (1-4 "Ineffective" -> "Highly effective", or "Not impactful" -> ...)
  | (QuestionBase & {
      type: "rating"
      prompt: string
      scale: { min: 1; max: 4 | 5; minLabel: string; maxLabel: string }
    })
  // Rank items (activities, vendors), 1 = highest priority. Every item gets exactly one rank.
  | (QuestionBase & {
      type: "ranking"
      prompt: string
      items: { id: string; text: string }[]
    })
  // Work Style: two statements; choose one and how strongly (4 options: A most / A more / B more / B most)
  | (QuestionBase & { type: "work_style"; left: string; right: string })
  // Pattern (IQ style): a sequence of figures with the next one missing; choose the figure that comes next.
  | (QuestionBase & {
      type: "pattern"
      prompt: string
      sequence: Figure[]
      choices: Choice[]
    })

export type QuestionType = Question["type"]

// Generic: the AI picks the sections that match the company's real test for that role (any company, any job).
export type SectionKind =
  | "work_simulation" // scenarios with messages/tables, rate or rank responses (Amazon-style)
  | "work_style" // forced-choice statement pairs (personality / work style)
  | "situational" // situational judgement, single choice
  | "numerical" // numbers, tables, charts
  | "logical" // patterns, sequences, abstract reasoning
  | "verbal" // reading comprehension, language reasoning
  | "technical" // role knowledge: coding concepts, accounting, marketing, SAP...
  | "skills" // the job's listed skills
  | "language" // English or Arabic proficiency
  | "personality" // values and motivation

export interface Section {
  id: string
  kind: SectionKind
  title: string // "Work Simulation"
  instructions: string // shown before the section starts
  timeLimitSec?: number | null // null = untimed
  scenarios: Scenario[]
  questions: Question[]
}

// ---- answers --------------------------------------------------------------------------------------------------

/** The seeker's answer, by question type. */
export type Answer =
  | { type: "single_choice"; choice: string }
  | { type: "multi_choice"; choices: string[] }
  | { type: "rating"; value: number }
  | { type: "ranking"; order: string[] } // item ids, first = rank 1
  | { type: "work_style"; side: "left" | "right"; strength: "most" | "more" }
  | { type: "pattern"; choice: string }

/** The server's key for one question (never sent before submission). */
export type AnswerKey =
  | { type: "single_choice"; correct: string }
  | { type: "multi_choice"; correct: string[] }
  | { type: "rating"; ideal: number } // partial credit by distance
  | { type: "ranking"; ideal: string[] } // partial credit by position distance
  | {
      type: "work_style"
      preferred: "left" | "right" | "either"
      trait: string
    } // the side the company's principles favour
  | { type: "pattern"; correct: string }

// ---- API shapes -----------------------------------------------------------------------------------------------

export type QuizStatus = "generating" | "ready" | "failed"

export interface QuizSummary {
  id: string
  title: string // "Amazon · Software Development Engineer"
  company: string | null
  role: string
  status: QuizStatus
  stage?: "reading" | "researching" | "writing" | null // while generating
  questionCount: number
  minutes: number // estimated
  sections: { kind: SectionKind; title: string; questions: number }[]
  bestScore: number | null // 0-100, best submitted attempt
  attempts: number
  lastAttemptId?: string | null // newest submitted attempt (the card's Results button)
  createdAt: string
  fromLibrary?: boolean // served from the shared library (cheaper, instant)
}

export interface QuizDetail extends Omit<QuizSummary, "sections"> {
  about: string // why this format: what the research found about the company's hiring test, 2-4 sentences
  sources?: { title: string; url: string }[] // research links, when any
  sections: Section[]
  history: { id: string; score: number; seconds: number; createdAt: string }[] // my attempts, newest first
}

/** POST /job-seeker/quizzes  — build a quiz (async; poll GET /job-seeker/quizzes/:id until status != generating). */
export type CreateQuiz = { jobId: string } | { description: string; company?: string | null; role?: string | null }

/** POST /job-seeker/quizzes/:id/attempts  — submit all answers at once. */
export interface SubmitAttempt {
  answers: Record<string, Answer> // question id -> answer (unanswered questions omitted)
  seconds: number // time taken
}

export interface QuestionResult {
  questionId: string
  score: number // 0-1
  answer: Answer | null
  key: AnswerKey
  explanation: string // why the ideal answer is ideal, tied to the company's principles where relevant
}

export interface AttemptResult {
  id: string
  quizId: string
  score: number // 0-100
  sections: { id: string; title: string; kind: SectionKind; score: number }[]
  questions: QuestionResult[]
  summary: string // 2-3 sentences: strengths and what to practise
  seconds: number
  createdAt: string
}

// Endpoints (all under /job-seeker, JWT):
//   GET    /quizzes                          -> QuizSummary[]   (mine, newest first)
//   GET    /quizzes/library?q=               -> QuizSummary[]   (shared library: company tests others built, ready)
//   POST   /quizzes                          -> QuizSummary     (CreateQuiz; status 'generating'; costs tokens)
//   POST   /quizzes/library/:id/take         -> QuizSummary     (copy a library quiz into mine; cheaper, instant)
//   GET    /quizzes/:id                      -> QuizDetail      (questions without keys)
//   POST   /quizzes/:id/attempts             -> AttemptResult   (SubmitAttempt; scored on the server)
//   GET    /quizzes/:id/attempts/:attemptId  -> AttemptResult
//   DELETE /quizzes/:id                      -> { ok: true }

// ==== Standard assessments ======================================================================================
// Fixed, validated item banks (no AI in the questions): matrix reasoning from the Open Matrices Item Bank (GPLv3) and
// personality / work-style inventories from the International Personality Item Pool (public domain). The AI only
// writes the candidate report, from the computed scores. Banks: plato-native-be/data/assessments.

export type AssessmentCategory = "reasoning" | "personality" | "work_style"

/** A matrix: 8 cells of a 3x3 grid (the 9th is the answer), each a 20-char mask of the construction elements drawn in it. */
export type AssessmentItem = { type: "matrix"; id: string; cells: string[] } | { type: "likert"; id: string; text: string } // "Take charge." -> 1 very inaccurate .. 5 very accurate

export type AssessmentAnswer =
  | { type: "matrix"; mask: string } // the 20 construction elements the seeker picked, '0'/'1'
  | { type: "likert"; value: number } // 1-5

export interface AssessmentSummary {
  slug: string // "matrix-3", "big-five"
  title: string
  about: string // one sentence: what it measures
  category: AssessmentCategory
  measures: string[] // the scales it reports ("Leadership", ...); reasoning: ["Fluid reasoning"]
  questionCount: number
  minutes: number // typical time
  timeLimitSec: number | null // reasoning only
  source: { name: string; url: string; license: string }
  attempts: number
  lastAttemptId: string | null
  lastHeadline: string | null // "Top 28%", "Highest: Leadership"
  lastAt: string | null
}

export interface AssessmentDetail extends AssessmentSummary {
  instructions: string[] // shown on the intro, one step per line
  example: { cells: string[]; answer: string } | null // matrix walk-through: all 9 cells and the answer mask
  items: AssessmentItem[] // no keys
  history: {
    id: string
    headline: string
    seconds: number
    createdAt: string
  }[] // newest first
}

export interface SubmitAssessment {
  answers: Record<string, AssessmentAnswer> // item id -> answer (unanswered omitted)
  seconds: number
}

export interface ScaleScore {
  key: string
  name: string // "Assertiveness"
  group: string | null // Big Five domain for a facet, else null
  score: number // 0-100 on the scale's own range (no population norms exist for IPIP scales)
  band: "low" | "mid" | "high"
  about: string // what a high score means, one sentence
}

export interface AssessmentResult {
  id: string
  slug: string
  title: string
  category: AssessmentCategory
  headline: string
  seconds: number
  createdAt: string
  reasoning: {
    correct: number
    total: number
    percentile: number // 0-100, vs the item bank's calibration sample
    items: {
      id: string
      cells: string[] // all 9 (the 9th is the answer)
      given: string | null // the seeker's mask
      correct: boolean
      rules: string[] // "addition", "rotation", ...
      level: "easy" | "medium" | "hard"
    }[]
  } | null
  domains: ScaleScore[] | null // Big Five: the five traits
  scales: ScaleScore[] | null // every scale (facets for the Big Five)
}

export interface CandidateReport {
  createdAt: string
  summary: string // 3-4 sentences, like a recruiter's screening note
  strengths: string[]
  watchouts: string[]
  workStyle: string // how they likely work with others, 2-3 sentences
  roles: string[] // kinds of roles that fit the profile
  interviewPrep: string[] // questions to prepare for, tied to the scores
}

export interface CandidateProfile {
  done: number // assessments with at least one attempt
  total: number
  reasoning: { percentile: number; items: number; tests: number } | null // pooled over every matrix answered
  domains: ScaleScore[] | null // latest Big Five (full or quick)
  highlights: ScaleScore[] // the most pronounced scales across the other inventories
  latest: {
    slug: string
    title: string
    category: AssessmentCategory
    headline: string
    attemptId: string
    createdAt: string
  }[]
  report: CandidateReport | null
  reportStale: boolean // newer attempts since the report was written
}

// Endpoints (all under /job-seeker, JWT):
//   GET    /assessments                          -> AssessmentSummary[]
//   GET    /assessments/profile                  -> CandidateProfile
//   POST   /assessments/profile/report           -> CandidateReport  (AI; costs tokens)
//   GET    /assessments/:slug                    -> AssessmentDetail
//   POST   /assessments/:slug/attempts           -> AssessmentResult (SubmitAssessment; scored on the server)
//   GET    /assessments/:slug/attempts/:attemptId -> AssessmentResult
