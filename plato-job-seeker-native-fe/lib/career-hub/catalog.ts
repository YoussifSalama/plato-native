import { BarChart3, Calculator, ClipboardCheck, FilePenLine, FileSearch, FileText, Hammer, HandCoins, Languages, Lightbulb, Mic, Presentation, Puzzle, UserRound, type LucideIcon } from "lucide-react"
import type { Accent } from "@/components/plato-ui"
import type { AssessmentSummary } from "@/lib/quizzes/contract"

// Every test and practice in Career, in one list: the Career overview and the Practice library.
// Items with their own screen link there; the rest start the career coach chat with a prompt.
// Interview items open the interview flow (/career/interviews/new) with their preset filled in.
export type PracticeCat = "Interviews" | "Aptitude" | "Personality" | "Skills" | "Language" | "Resume"
export type Practice = { id: string; cat: PracticeCat; title: string; body: string; meta: string; icon: LucideIcon; prompt?: string; href?: string; cta?: string }

export const PRACTICE_CATS: PracticeCat[] = ["Interviews", "Aptitude", "Personality", "Skills", "Language", "Resume"]
export const CAT_ACCENT: Record<PracticeCat, Accent> = { Interviews: "cobalt", Aptitude: "azure", Personality: "rose", Skills: "amber", Language: "teal", Resume: "green" }

const interview = (q: string) => `/career/interviews/new?${q}`
export const CATALOG: Practice[] = [
  // Order is what "All" shows first: one of each kind on page 1, then the rest.
  { id: "behavioral", cat: "Interviews", title: "Behavioral interview (STAR)", body: "Common “tell me about a time” questions, judged on structure and results", meta: "15 min · All levels", icon: Mic, href: interview("target=general&focus=behavioral") },
  { id: "resume-score", cat: "Resume", title: "Resume score", body: "See what to fix before Plato applies", meta: "3 min", icon: FileSearch, prompt: "Score my resume out of 100 and list the quick fixes" },
  { id: "assessment", cat: "Skills", title: "Hiring quiz", body: "A practice test in the company's own format, for any job", meta: "10 to 30 min · Built for you", icon: ClipboardCheck, href: "/career/quizzes" },
  { id: "numerical", cat: "Aptitude", title: "Numerical reasoning", body: "Practice questions with your coach, one at a time", meta: "15 min · With your coach", icon: BarChart3, prompt: "Give me a numerical reasoning practice test, one question at a time" },
  { id: "case", cat: "Interviews", title: "Case interview", body: "Size a market or find why profits fell, thinking out loud", meta: "30 min · Hard", icon: Calculator, href: interview("format=case") },
  { id: "english", cat: "Language", title: "Business English", body: "Interview answers in English, with gentle corrections", meta: "15 min · All levels", icon: Languages, href: interview("format=english") },
  { id: "technical", cat: "Interviews", title: "Technical interview", body: "Your skills and how you work, built from your CV", meta: "20 min · All levels", icon: Mic, href: interview("target=general&focus=technical") },
  { id: "mixed", cat: "Interviews", title: "First-round interview", body: "A bit of everything, like a first call with a recruiter", meta: "15 min · All levels", icon: Mic, href: interview("target=general&focus=mixed") },
  { id: "pitch", cat: "Interviews", title: "Presenting a solution", body: "Pitch to a skeptical client who pushes back", meta: "15 min · Senior", icon: Presentation, href: interview("format=pitch") },
  { id: "negotiation", cat: "Interviews", title: "Salary negotiation role-play", body: "Practise asking for more against a tough recruiter", meta: "10 min · All levels", icon: HandCoins, href: interview("format=negotiation") },
  { id: "logical", cat: "Aptitude", title: "Logical reasoning", body: "Patterns and deductions with your coach, one at a time", meta: "15 min · With your coach", icon: Puzzle, prompt: "Give me a logical reasoning practice test, one question at a time" },
  { id: "proof", cat: "Skills", title: "Proof of skills challenge", body: "A real work sample, scored against a rubric", meta: "15–30 min", icon: Hammer, href: "/career/proof" },
  { id: "skill-gap", cat: "Skills", title: "Close a skill gap", body: "Skills your matches ask for that aren't on your CV", meta: "Your matches", icon: Lightbulb, href: "/career/skills" },
  { id: "build-resume", cat: "Resume", title: "Build my resume", body: "From your profile, ready as a PDF", meta: "5 min", icon: FileText, prompt: "Build my resume" },
  { id: "tailor", cat: "Resume", title: "Tailor to a job", body: "Paste a posting, get a resume that matches it", meta: "5 min", icon: FilePenLine, prompt: "Tailor my resume to a job. I'll paste the posting." },
]

export const startHref = (p: Practice) => p.href ?? `/career?prompt=${encodeURIComponent(p.prompt ?? p.title)}`
export const byId = (id: string) => CATALOG.find((p) => p.id === id)

// The scored tests the server serves (reasoning matrices, personality and work-style inventories),
// as catalog items. Taken before: the button says Retake and the meta shows the last result.
export const fromAssessment = (a: AssessmentSummary): Practice => ({
  id: `test-${a.slug}`,
  cat: a.category === "reasoning" ? "Aptitude" : "Personality",
  title: a.title,
  body: a.about,
  meta: a.attempts && a.lastHeadline ? `Last: ${a.lastHeadline}` : `${a.minutes} min · ${a.questionCount} questions`,
  icon: a.category === "reasoning" ? Puzzle : UserRound,
  href: `/career/quizzes/assessments/${a.slug}`,
  ...(a.attempts > 0 && { cta: "Retake" }),
})

// "All" shows one of each kind first: the first three fixed items, one reasoning test and one
// personality test, then everything else.
export function withTests(tests: Practice[]): Practice[] {
  const lead = [tests.find((t) => t.cat === "Aptitude"), tests.find((t) => t.cat === "Personality")].filter((t): t is Practice => !!t)
  return [...CATALOG.slice(0, 3), ...lead, ...CATALOG.slice(3), ...tests.filter((t) => !lead.includes(t))]
}
