"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { PlatoNote, Segmented } from "@/components/plato-ui"
import { Button } from "@/components/ui/button"
import { interviewQuestions, type Focus } from "@/lib/career-hub/content"
import { useCareerData } from "@/lib/career-hub/snapshot"
import { InterviewSession } from "../interview-session"

const FOCUS: { value: Focus; label: string; body: string }[] = [
  { value: "mixed", label: "Mixed", body: "A bit of everything, like a first-round interview" },
  { value: "behavioral", label: "Behavioral", body: "“Tell me about a time…” questions, scored on structure and results" },
  { value: "technical", label: "Technical", body: "Your skills and how you work, built from your CV" },
  { value: "situational", label: "Situational", body: "“What would you do if…” judgement questions" },
]

// General AI interview: set it up (role, focus, length), then the session, then results.
function GeneralInterview() {
  const params = useSearchParams()
  const data = useCareerData()
  // Until edited, the fields show the target role and top CV skill from the profile.
  const [roleEdit, setRole] = useState<string | null>(null)
  const [skillEdit, setSkill] = useState<string | null>(null)
  const role = roleEdit ?? data?.role ?? ""
  const skill = skillEdit ?? data?.skills[0] ?? ""
  const [focus, setFocus] = useState<Focus>((FOCUS.find((f) => f.value === params.get("focus"))?.value ?? "mixed") as Focus)
  const [length, setLength] = useState<"3" | "5">("5")
  const [running, setRunning] = useState(false)

  const crumbs = [{ label: "Career", href: "/career" }, { label: "Interviews", href: "/career/interviews" }]
  if (running)
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title="General interview" />
        <InterviewSession questions={interviewQuestions(focus, role, skill, Number(length))} title={`${FOCUS.find((f) => f.value === focus)!.label} interview`} subtitle={role || "Any role"} kind="interview" retryHref={`/career/interviews/general?focus=${focus}`} interviewer="Plato" />
      </div>
    )

  return (
    <div className={PAGE}>
      <PageHeader crumbs={crumbs} title="General interview" description="Practise the questions most interviews share. Every answer gets a score out of 5 and one thing to fix." />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border bg-card p-6">
        <label className="flex flex-col gap-1.5">
          <b className="text-[14.5px]">Role you&apos;re interviewing for</b>
          <input data-ai="interview.general.role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Presales Consultant" className="h-11 rounded-xl border bg-background px-3.5 text-sm outline-none focus:border-primary-line" />
        </label>
        <label className="flex flex-col gap-1.5">
          <b className="text-[14.5px]">Main skill to be asked about</b>
          <input data-ai="interview.general.skill" value={skill} onChange={(e) => setSkill(e.target.value)} list="cv-skills" placeholder="e.g. SQL" className="h-11 rounded-xl border bg-background px-3.5 text-sm outline-none focus:border-primary-line" />
          <datalist id="cv-skills">{data?.skills.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <div className="flex flex-col gap-2">
          <b className="text-[14.5px]">Focus</b>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FOCUS.map((f) => (
              <button key={f.value} type="button" data-ai={`interview.general.focus.${f.value}`} aria-pressed={focus === f.value} onClick={() => setFocus(f.value)} className={cn("flex flex-col gap-0.5 rounded-xl border px-3.5 py-3 text-left transition-colors", focus === f.value ? "border-primary bg-primary-tint" : "bg-card hover:border-primary-line")}>
                <b className={cn("text-sm", focus === f.value && "text-primary")}>{f.label}</b>
                <span className="text-[12.5px] text-text-secondary">{f.body}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <b className="text-[14.5px]">Length</b>
          <Segmented value={length} onChange={setLength} dataAi="interview.general.length" options={[{ value: "3", label: "3 questions · 8 min" }, { value: "5", label: "5 questions · 15 min" }]} />
        </div>
        <PlatoNote variant="inline">Answers are written, like a chat interview. Want to talk it through out loud? Use the voice interview in the career coach.</PlatoNote>
        <div className="flex items-center justify-between gap-3">
          <Link href="/career" className="text-sm font-semibold text-text-secondary hover:text-foreground">Back to Career</Link>
          <Button data-ai="interview.general.start" onClick={() => setRunning(true)}>
            Start interview
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function GeneralInterviewPage() {
  return (
    <Suspense fallback={null}>
      <GeneralInterview />
    </Suspense>
  )
}
