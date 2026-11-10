import type { Challenge, InterviewQ } from "./content"
import type { HubItem } from "./store"

// Practice scoring in the browser: fixed, explainable rules (like the server's resume score),
// so the seeker can see exactly why a mark was given. Not an AI judgement.

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean)
const FILLERS = /\b(um+|uh+|basically|literally|you know|kind of|sort of|like,)\b/gi

export function scoreAnswer(q: InterviewQ, answer: string): HubItem {
  const w = words(answer)
  const n = w.length
  const notes: string[] = []
  let pts = 0
  // Length: 60-250 words is a full spoken answer of 1-2 minutes.
  if (n >= 60 && n <= 260) pts += 1.2
  else if (n >= 30) {
    pts += 0.6
    notes.push(n > 260 ? "trim it to the key points" : "add more detail")
  }
  else notes.push("this is too short to judge; aim for 60+ words")
  // A number makes a result believable.
  const numbers = /\d/.test(answer)
  if (numbers) pts += 0.9
  else notes.push("add a number (time saved, %, people, money)")
  // Your own actions, not only the team's.
  const mine = (answer.match(/\bI\b|\bI'(m|ve|d)\b|\bmy\b/g) ?? []).length
  const ours = (answer.match(/\bwe\b|\bour\b/gi) ?? []).length
  if (mine >= 2 && mine >= ours / 2) pts += 0.8
  else notes.push("say what you did (\"I\"), not only the team")
  // Structure: situation → action → result.
  const result = /\b(result|outcome|so that|which meant|led to|reduced|increased|saved|grew|improved|delivered|launched|won)\b/i.test(answer)
  const action = /\b(I (led|built|wrote|set up|created|decided|proposed|organi[sz]ed|analy[sz]ed|talked|met|changed|designed|ran|owned))\b/i.test(answer)
  if (result) pts += 0.6
  else notes.push("end with the result")
  if (action || q.kind === "motivation") pts += 0.5
  else if (q.kind !== "technical") notes.push("name the actions you took")
  // Questions about how you'd work reward options and reasoning.
  if ((q.kind === "situational" || q.kind === "technical") && /\b(first|then|because|option|trade-?off|priorit|depend)/i.test(answer)) pts += 0.4
  const fillers = (answer.match(FILLERS) ?? []).length
  if (fillers > 2) {
    pts -= 0.4
    notes.push("cut filler words")
  }
  const score = Math.max(1, Math.min(5, Math.round(pts + 0.6)))
  const feedback = score >= 4 ? (notes.length ? `Strong answer. To make it great: ${notes[0]}.` : "Strong, specific answer with a clear result.") : `To improve: ${notes.slice(0, 2).join("; ")}.`
  return { label: q.text, answer, score, max: 5, feedback }
}

export function scoreInterview(qs: InterviewQ[], answers: string[]) {
  const items = qs.map((q, i) => scoreAnswer(q, answers[i] ?? ""))
  const all = answers.join(" ")
  const avgWords = items.length ? words(all).length / items.length : 0
  const sentences = all.split(/[.!?]+/).filter((s) => s.trim()).length || 1
  const perSentence = words(all).length / sentences
  const fillers = (all.match(FILLERS) ?? []).length
  const comm = Math.max(1, Math.min(5, Math.round(5 - (perSentence > 32 ? 1.2 : 0) - (avgWords < 40 ? 1.5 : 0) - Math.min(1.5, fillers * 0.3))))
  const content = items.reduce((s, x) => s + x.score, 0) / Math.max(1, items.length)
  const overall = Math.round(((content * 0.8 + comm * 0.2) / 5) * 100)
  const byKind = (k: InterviewQ["kind"]) => {
    const xs = items.filter((_, i) => qs[i].kind === k)
    return xs.length ? Math.round((xs.reduce((s, x) => s + x.score, 0) / xs.length / 5) * 100) : null
  }
  const breakdown = (
    [
      ["Behavioral", byKind("behavioral")],
      ["Technical", byKind("technical")],
      ["Situational", byKind("situational")],
      ["Motivation", byKind("motivation")],
      ["Communication", Math.round((comm / 5) * 100)],
    ] as [string, number | null][]
  )
    .filter(([, v]) => v !== null)
    .map(([label, score]) => ({ label, score: score as number }))
  const strengths: string[] = []
  const improve: string[] = []
  if (items.filter((x) => /\d/.test(x.answer ?? "")).length >= Math.ceil(items.length / 2)) strengths.push("You back answers with numbers")
  else improve.push("Put a number in more answers: time, %, people or money")
  if (items.some((x) => x.score >= 4)) strengths.push(`Best answer: “${short(items.reduce((a, b) => (b.score > a.score ? b : a)).label)}”`)
  if (comm >= 4) strengths.push("Clear, easy-to-follow wording")
  else improve.push("Shorter sentences and fewer filler words")
  const weakest = items.reduce((a, b) => (b.score < a.score ? b : a), items[0])
  if (weakest && weakest.score <= 3) improve.push(`Rework: “${short(weakest.label)}”`)
  if (!strengths.length) strengths.push("You finished a full interview, which is the hardest part")
  return { items, overall, breakdown, strengths, improve }
}

export function scoreProof(c: Challenge, text: string) {
  const met = c.rubric.map((r) => r.any.test(text))
  const n = words(text).length
  const coverage = met.filter(Boolean).length / c.rubric.length
  const depth = Math.min(1, n / c.targetWords)
  const score = Math.round((coverage * 0.8 + depth * 0.2) * 100)
  const items: HubItem[] = c.rubric.map((r, i) => ({ label: r.label, score: met[i] ? 1 : 0, max: 1, feedback: met[i] ? "Covered" : `Missing. Tip: ${r.hint}` }))
  return {
    score,
    items,
    breakdown: [
      { label: "Rubric covered", score: Math.round(coverage * 100) },
      { label: "Depth", score: Math.round(depth * 100) },
    ],
    strengths: c.rubric.filter((_, i) => met[i]).slice(0, 3).map((r) => r.label),
    improve: c.rubric.filter((_, i) => !met[i]).slice(0, 3).map((r) => `${r.label} (${r.hint})`),
  }
}

const short = (s: string) => (s.length > 70 ? `${s.slice(0, 67).trim()}…` : s)
