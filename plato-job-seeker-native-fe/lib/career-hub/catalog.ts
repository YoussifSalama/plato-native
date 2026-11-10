import { BarChart3, ClipboardCheck, FilePenLine, FileSearch, FileText, Hammer, Lightbulb, Puzzle, type LucideIcon } from "lucide-react"
import type { Accent } from "@/components/plato-ui"

// Every non-interview practice in Career, in one list: the Practice library (/career/library).
// Items with their own screen link there; the rest start the career coach chat with a prompt.
// Interviews of every kind (general, a job, salary negotiation, case, pitch, business English)
// have their own flow: /career/interviews/new.
export type PracticeCat = "Aptitude" | "Skills" | "Resume"
export type Practice = { id: string; cat: PracticeCat; title: string; body: string; meta: string; icon: LucideIcon; prompt?: string; href?: string }

export const PRACTICE_CATS: PracticeCat[] = ["Aptitude", "Skills", "Resume"]
export const CAT_ACCENT: Record<PracticeCat, Accent> = { Aptitude: "azure", Skills: "amber", Resume: "green" }

export const CATALOG: Practice[] = [
  { id: "numerical", cat: "Aptitude", title: "Numerical reasoning", body: "Timed questions, used by many consulting firms", meta: "18 min · Medium", icon: BarChart3, prompt: "Give me a numerical reasoning practice test, one question at a time" },
  { id: "logical", cat: "Aptitude", title: "Logical reasoning", body: "Patterns and deductions, one question at a time", meta: "15 min · Medium", icon: Puzzle, prompt: "Give me a logical reasoning practice test, one question at a time" },
  { id: "assessment", cat: "Skills", title: "Skill assessment", body: "Adaptive test that measures your level", meta: "8 min · Adaptive", icon: ClipboardCheck, href: "/career/assessments" },
  { id: "proof", cat: "Skills", title: "Proof of skills challenge", body: "A real work sample, scored against a rubric", meta: "15–30 min", icon: Hammer, href: "/career/proof" },
  { id: "skill-gap", cat: "Skills", title: "Close a skill gap", body: "Skills your matches ask for that aren't on your CV", meta: "Your matches", icon: Lightbulb, href: "/career/skills" },
  { id: "resume-score", cat: "Resume", title: "Resume score", body: "See what to fix before Plato applies", meta: "3 min", icon: FileSearch, prompt: "Score my resume out of 100 and list the quick fixes" },
  { id: "build-resume", cat: "Resume", title: "Build my resume", body: "From your profile, ready as a PDF", meta: "5 min", icon: FileText, prompt: "Build my resume" },
  { id: "tailor", cat: "Resume", title: "Tailor to a job", body: "Paste a posting, get a resume that matches it", meta: "5 min", icon: FilePenLine, prompt: "Tailor my resume to a job. I'll paste the posting." },
]

export const startHref = (p: Practice) => p.href ?? `/career?prompt=${encodeURIComponent(p.prompt ?? p.title)}`
export const byId = (id: string) => CATALOG.find((p) => p.id === id)
