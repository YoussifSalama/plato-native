"use client"

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, BriefcaseBusiness, Calculator, ClipboardCheck, Coins, Compass, GraduationCap, HandCoins, Languages, Layers, Loader2, MessagesSquare, Mic, MicOff, PenLine, Phone, Presentation, RotateCcw, Sparkles, UserRound, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { CARD } from "@/components/plato-ui"
import { InfoTip } from "@/components/info-tip"
import { Skeleton } from "@/components/ui/skeleton"
import { OUTLINE_CTA } from "@/components/career-hub"
import { resetLabel, useEstimates, useTokens } from "@/components/plato-tokens"
import { formatTokens, type TokenEstimate } from "@/lib/credits/api"
import { getPreferences } from "@/lib/preferences/api"
import { getProfile } from "@/lib/documents/api"
import { getMatches } from "@/lib/jobs/api"
import { createCareerThread } from "@/lib/career/api"
import { startInterview } from "@/lib/interviews/api"
import { invalidateCareerData } from "@/lib/career-hub/snapshot"
import { saveResult } from "@/lib/career-hub/store"
import { FOCUS, FORMATS, HOWS, ROUNDS, STYLES, TARGETS, flowHref, focusLabel, interviewName, isAnswered, lengthOf, pasteOk, pasteWords, readAnswers, startRequest, usePaste, NOTES_MAX, stepsFor, voiceSetup, writePaste, type FlowAnswers, type Paste, type StepKey } from "@/lib/interviews/flow"
import { useVoiceCall, VoiceLive } from "../../voice-interview"
import { FlowShell, OptionCard, Question, QuestionNav, useNumberKeys } from "../flow-ui"
import { JobPicker } from "../job-picker"
import { QuestionBar, RunHeader } from "../chat-run"
import { voiceResult } from "../interview-result"

// The interview flow: one question per screen, like onboarding, then a summary with the exact
// cost and ONE Start, then the interview itself as the last step (a written interview opens
// /career/interviews/<id>; a voice call runs right here). Answers live in the URL.
const NAME: Record<StepKey, string> = { target: "What", job: "Job", role: "Role", focus: "Questions", format: "Situation", round: "Round", how: "How", style: "Style", ready: "Ready" }
const TARGET_ICON: Record<string, LucideIcon> = { job: BriefcaseBusiness, general: GraduationCap, situation: Compass }
const FOCUS_ICON: Record<string, LucideIcon> = { mixed: Layers, behavioral: MessagesSquare, technical: ClipboardCheck, situational: Compass }
const FORMAT_ICON: Record<string, LucideIcon> = { negotiation: HandCoins, case: Calculator, pitch: Presentation, english: Languages }
const ROUND_ICON: Record<string, LucideIcon> = { screen: Phone, manager: UserRound, loop: Layers }
const HOW_ICON: Record<string, LucideIcon> = { voice: Mic, chat: PenLine }
const STYLE_ICON: Record<string, LucideIcon> = { real: ClipboardCheck, coach: Sparkles }
const UNSCORED: Record<string, string> = {
  short: "The call was too short to judge. Answer at least a couple of questions in full sentences next time.",
  tokens: "Your Plato tokens ran out with the call, so there was nothing left for the written scorecard. The transcript is saved in your Plato AI conversations.",
  failed: "The scorecard couldn't be written this time. The transcript is saved in your Plato AI conversations.",
}

function NewInterview() {
  const params = useSearchParams()
  const router = useRouter()
  const a = useMemo(() => readAnswers(new URLSearchParams(params.toString())), [params])
  // The pasted post waits in this tab (too long for the URL). Read after mount (no sessionStorage on the server).
  const stored = usePaste()
  const paste = stored ?? null
  const pasteLoaded = stored !== undefined
  const pasteReady = a.job === "paste" && pasteOk(paste)
  const steps = stepsFor(a)
  const asked = params.get("step") as StepKey | null
  const open = steps.find((s) => !isAnswered(s, a, pasteReady)) ?? "ready"
  const step: StepKey = asked && steps.includes(asked) ? asked : open
  const idx = steps.indexOf(step)

  const go = useCallback((patch: Partial<FlowAnswers>, to?: StepKey) => router.push(flowHref({ ...a, ...patch }, to), { scroll: false }), [a, router])
  // After an answer: the next question that is not answered yet (a preset skips its question).
  const advance = useCallback(
    (patch: Partial<FlowAnswers>, pasted = pasteReady) => {
      const next = { ...a, ...patch }
      const list = stepsFor(next)
      const after = list.slice(list.indexOf(step) + 1).find((s) => !isAnswered(s, next, pasted)) ?? "ready"
      go(patch, after === "ready" ? undefined : after)
    },
    [a, go, pasteReady, step],
  )
  const back = () => (idx > 0 ? go({}, steps[idx - 1]) : router.push("/career/interviews"))

  // A job from a link without its title (an old link, Plato AI): look it up in the seeker's lists.
  useEffect(() => {
    if (!a.job || a.job === "paste" || a.jt) return
    let alive = true
    Promise.all((["discover", "saved", "applied"] as const).map((tab) => getMatches({ tab, sort: "best", take: 100 }).catch(() => null))).then((rs) => {
      const m = rs.flatMap((r) => r?.items ?? []).find((x) => x.job.id === a.job)
      if (alive && m) router.replace(flowHref({ ...a, jt: m.job.title, jc: m.job.company }, asked ?? undefined), { scroll: false })
    })
    return () => {
      alive = false
    }
  }, [a, asked, router])

  if (a.job === "paste" && !pasteLoaded)
    return (
      <FlowShell step={1} name="…">
        <Skeleton className="h-64 rounded-2xl" />
      </FlowShell>
    )
  if (step === "ready") return <Ready a={a} paste={paste} onBack={back} onEdit={(s) => go({}, s)} />

  return (
    <FlowShell step={idx + 1} name={NAME[step]}>
      {step === "target" && (
        <Choice
          id="target"
          title="What are you preparing for?"
          hint="Plato sets up the interview around it."
          options={TARGETS.map((t) => ({ ...t, icon: TARGET_ICON[t.key], dataAi: `interview.new.target.${t.key}` }))}
          value={a.target}
          onPick={(k) => advance(k === a.target ? {} : { target: k, job: undefined, jt: undefined, jc: undefined, retry: undefined, focus: undefined, format: undefined, round: undefined })}
          onBack={back}
        />
      )}
      {step === "job" && <JobStep a={a} paste={paste} onBack={back} onPaste={(p) => (writePaste(p), advance({ job: "paste", jt: p.title.trim(), jc: p.company.trim() || undefined, retry: undefined }, true))} onPick={(j) => advance({ job: j.id, jt: j.title, jc: j.company, retry: undefined })} onNext={() => advance({})} />}
      {step === "role" && <RoleStep a={a} onBack={back} onNext={(role, skill, notes) => advance({ role, skill, notes })} />}
      {step === "focus" && <Choice id="focus" title="What kind of questions?" hint="Mixed is like a first round. The others practise one kind of question." options={FOCUS.map((f) => ({ ...f, icon: FOCUS_ICON[f.key], dataAi: `interview.new.focus.${f.key}` }))} value={a.focus} onPick={(k) => advance({ focus: k })} onBack={back} />}
      {step === "format" && <Choice id="format" title="Which situation?" hint="Plato plays the other side and judges how you handle it." options={FORMATS.map((f) => ({ ...f, icon: FORMAT_ICON[f.key], dataAi: `interview.new.format.${f.key}` }))} value={a.format} onPick={(k) => advance({ format: k })} onBack={back} />}
      {step === "round" && (
        <Choice
          id="round"
          title="Which round is coming up?"
          hint={a.jt ? `Hiring for ${a.jt} happens in rounds, each with different questions. Pick the one you have next.` : "Hiring happens in rounds, each with different questions. Pick the one you have next."}
          options={ROUNDS.map((r) => ({ ...r, icon: ROUND_ICON[r.key], dataAi: `interview.new.round.${r.key}` }))}
          value={a.round}
          onPick={(k) => advance({ round: k })}
          onBack={back}
        />
      )}
      {step === "how" && (
        <Choice
          id="how"
          title="How do you want to answer?"
          hint={
            <>
              Both are scored the same way and end with the same result.{" "}
              <InfoTip text="Out loud is a live call with Plato, charged by the minute. In writing is charged per question. You see the exact cost before you start." label="What each costs" />
            </>
          }
          options={HOWS.map((h) => ({ ...h, icon: HOW_ICON[h.key], dataAi: `interview.new.how.${h.key}` }))}
          value={a.how}
          onPick={(k) => advance({ how: k })}
          onBack={back}
        />
      )}
      {step === "style" && <Choice id="style" title="How should Plato treat you?" hint="You can switch next time." options={STYLES.map((s) => ({ ...s, icon: STYLE_ICON[s.key], dataAi: `interview.new.style.${s.key}` }))} value={a.style} onPick={(k) => advance({ style: k })} onBack={back} />}
    </FlowShell>
  )
}

// A question with big answer cards: a click (or its number key) answers and moves on.
function Choice<K extends string>({ id, title, hint, options, value, onPick, onBack }: { id: string; title: string; hint?: ReactNode; options: { key: K; title: string; body: string; icon: LucideIcon; dataAi: string }[]; value?: K; onPick: (k: K) => void; onBack: () => void }) {
  const pick = useCallback((i: number) => onPick(options[i].key), [onPick, options])
  useNumberKeys(options.length, pick)
  return (
    <Question id={id} tourState={`interview-new.${id}`} title={title} hint={hint} footer={<QuestionNav dataAi="interview.new.next" onBack={onBack} next={!!value} onNext={() => value && onPick(value)} />}>
      <div data-tour="interview-options" role="radiogroup" aria-label={title} className="flex flex-col gap-2.5">
        {options.map((o, i) => (
          <OptionCard key={o.key} data-ai={o.dataAi} icon={o.icon} title={o.title} body={o.body} selected={value === o.key} onPick={() => onPick(o.key)} n={i + 1} index={i} />
        ))}
      </div>
    </Question>
  )
}

function JobStep({ a, paste, onBack, onPick, onPaste, onNext }: { a: FlowAnswers; paste: Paste | null; onBack: () => void; onPick: (j: { id: string; title: string; company: string }) => void; onPaste: (p: Paste) => void; onNext: () => void }) {
  const [pasting, setPasting] = useState(a.job === "paste")
  const [draft, setDraft] = useState<Paste>(() => paste ?? { title: "", company: "", description: "" })
  const words = pasteWords(draft.description)
  if (pasting)
    return (
      <Question id="paste" tourState="interview-new.paste" title="Paste the job post" hint="Plato reads it and asks what this employer would ask. It stays in this tab only.">
        <div data-tour="interview-paste-form" className={cn(CARD, "flex flex-col gap-3 p-4 sm:p-5")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input autoFocus data-ai="interview.new.paste.title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} placeholder="Job title" aria-label="Job title" className="h-11 rounded-xl border bg-background px-3.5 text-sm transition-colors duration-200 outline-none focus:border-primary-line" />
            <input data-ai="interview.new.paste.company" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} maxLength={120} placeholder="Company (optional)" aria-label="Company" className="h-11 rounded-xl border bg-background px-3.5 text-sm transition-colors duration-200 outline-none focus:border-primary-line" />
          </div>
          <textarea data-ai="interview.new.paste.text" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={9} maxLength={12_000} placeholder="Paste the job description (at least a paragraph)" aria-label="Job description" className="scroll-thin rounded-xl border bg-background p-3.5 text-sm leading-relaxed transition-colors duration-200 outline-none focus:border-primary-line" />
          <p className={cn("type-meta tabular-nums", words >= 30 ? "text-success-ink" : "text-text-tertiary")}>{words < 30 ? `${words} of at least 30 words${draft.title.trim() ? "" : " · add the job title too"}` : `${words} words · ready`}</p>
        </div>
        <QuestionNav
          dataAi="interview.new.next"
          onBack={() => setPasting(false)}
          extra={
            <span className="hidden text-xs text-text-tertiary sm:inline">
              Back to your job list
            </span>
          }
          next
          nextDisabled={!pasteOk(draft)}
          onNext={() => onPaste(draft)}
        />
      </Question>
    )
  return (
    <Question id="job" tourState="interview-new.job" title="Which job?" hint="Questions come from its posting and your CV, like the real interview would.">
      <JobPicker pickedId={a.job && a.job !== "paste" ? a.job : null} onPick={onPick} onPaste={() => setPasting(true)} />
      <QuestionNav dataAi="interview.new.next" onBack={onBack} next={!!a.retry || (a.job === "paste" ? pasteOk(paste) : !!a.job)} onNext={onNext} />
    </Question>
  )
}

function RoleStep({ a, onBack, onNext }: { a: FlowAnswers; onBack: () => void; onNext: (role: string, skill?: string, notes?: string) => void }) {
  const [role, setRole] = useState(a.role ?? "")
  const [skill, setSkill] = useState(a.skill ?? "")
  const [notes, setNotes] = useState(a.notes ?? "")
  const [roles, setRoles] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    getPreferences()
      .then((p) => {
        if (!alive) return
        setRoles((p.roles ?? []).slice(0, 5))
        // Start from the role they are looking for, unless one came with the link.
        if (!a.role && p.roles?.[0]) setRole((r) => r || p.roles[0])
      })
      .catch(() => undefined)
    if (a.target === "general")
      getProfile()
        .then((p) => alive && setSkills(p.skills.slice(0, 12)))
        .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [a.role, a.target])
  const ok = role.trim().length > 1
  const submit = () => ok && onNext(role.trim().slice(0, 80), a.target === "general" ? skill.trim().slice(0, 60) || undefined : undefined, notes.trim().slice(0, NOTES_MAX) || undefined)
  const general = a.target === "general"
  return (
    <Question id="role" tourState={general ? "interview-new.role.general" : "interview-new.role.situation"} title={general ? "Which role are you interviewing for?" : "What's your role or field?"} hint={general ? "The questions fit this role and what's on your CV." : `So the ${a.format === "pitch" ? "client" : a.format === "negotiation" ? "recruiter" : "interviewer"} fits your world.`}>
      <div className={cn(CARD, "flex flex-col gap-4 p-4 sm:p-5")}>
        <label className="flex flex-col gap-2">
          <b className="text-[14.5px]">Role</b>
          <input
            autoFocus
            data-ai="interview.new.role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
            maxLength={80}
            placeholder="e.g. Presales Consultant"
            className="h-12 rounded-xl border bg-background px-3.5 text-[15px] transition-colors duration-200 outline-none focus:border-primary-line"
          />
        </label>
        {roles.length > 0 && (
          <div data-tour="interview-role-chips" className="-mt-1 flex flex-wrap gap-2" aria-label="Your roles">
            {roles.map((r) => (
              <button key={r} type="button" data-ai={`interview.new.role:${r}`} onClick={() => setRole(r)} aria-pressed={role === r} className={cn("rounded-full border px-3 py-1 text-[13px] font-medium transition-colors duration-200", role === r ? "border-primary bg-primary-soft text-primary" : "bg-card text-text-secondary hover:border-primary-line hover:text-primary")}>
                {r}
              </button>
            ))}
          </div>
        )}
        {general && (
          <label className="flex flex-col gap-2 border-t border-divider pt-4">
            <b className="flex items-center gap-1.5 text-[14.5px]">
              Main skill to be asked about <span className="font-normal text-text-tertiary">(optional)</span>
              <InfoTip text="Used for the technical questions. Leave it empty and Plato picks from your CV." label="How the main skill is used" />
            </b>
            <input data-ai="interview.new.skill" value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())} list="interview-skills" maxLength={60} placeholder="e.g. SQL" className="h-11 rounded-xl border bg-background px-3.5 text-sm transition-colors duration-200 outline-none focus:border-primary-line" />
            <datalist id="interview-skills">
              {skills.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        )}
        <label className="flex flex-col gap-2 border-t border-divider pt-4">
          <b className="flex items-center gap-1.5 text-[14.5px]">
            Anything we should know? <span className="font-normal text-text-tertiary">(optional)</span>
            <InfoTip text="Plato uses it to pick the topics and the level of the questions. It is never shared." label="How your notes are used" />
          </b>
          <textarea data-ai="interview.new.notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))} rows={4} maxLength={NOTES_MAX} placeholder={a.target === "situation" ? "The offer you expect, the client or company type, what you want to practise…" : "Level, team or company type, topics you expect, or paste a job ad"} className="scroll-thin rounded-xl border bg-background p-3.5 text-sm leading-relaxed transition-colors duration-200 outline-none focus:border-primary-line" />
          <span className={cn("type-meta self-end tabular-nums", notes.length > NOTES_MAX * 0.9 ? "text-warning-ink" : "text-text-tertiary")}>
            {notes.length} / {NOTES_MAX}
          </span>
        </label>
      </div>
      <QuestionNav dataAi="interview.new.next" onBack={onBack} next nextDisabled={!ok} onNext={submit} />
    </Question>
  )
}

// ---- Ready: the summary, the exact cost, ONE Start; then the interview itself ----

function costOf(list: TokenEstimate[] | null, a: FlowAnswers) {
  const e = (k: string) => list?.find((x) => x.action === k)
  const n = lengthOf(a).questions ?? 5
  const start = e("interview_start")
  const answer = e(a.style === "coach" ? "interview_answer_coach" : "interview_answer")
  if (start && answer) return { about: start.about + n * answer.about, upTo: start.upTo + n * answer.upTo }
  const whole = e("mock_interview")
  return whole ? { about: whole.about, upTo: whole.upTo } : null
}

function Row({ label, value, onEdit, step, tour }: { label: string; value: ReactNode; onEdit?: (s: StepKey) => void; step?: StepKey; tour?: string }) {
  return (
    <div data-tour={tour} className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="w-24 shrink-0 text-[13px] text-text-tertiary sm:w-28">{label}</span>
      <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-foreground">{value}</span>
      {onEdit && step && (
        <button type="button" data-ai={`interview.new.edit:${step}`} onClick={() => onEdit(step)} className="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold text-primary transition-colors duration-200 hover:bg-primary-soft">
          Change
        </button>
      )}
    </div>
  )
}

function Ready({ a, paste, onBack, onEdit }: { a: FlowAnswers; paste: Paste | null; onBack: () => void; onEdit: (s: StepKey) => void }) {
  const router = useRouter()
  const tokens = useTokens()
  const estimates = useEstimates()
  const call = useVoiceCall()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voice = a.how === "voice"
  const len = lengthOf(a)
  const title = interviewName({ target: a.target === "situation" ? undefined : a.target, jobTitle: a.job === "paste" ? paste?.title || a.jt : a.jt || "Your selected job", round: a.round, focus: a.focus, format: a.format })
  const cost = costOf(estimates, a)
  const rate = estimates?.find((x) => x.action === "voice_minute")?.about ?? null
  const scoreCost = estimates?.find((x) => x.action === "voice_scorecard")?.about ?? null
  const balance = tokens ? Math.max(0, tokens.balance) : null
  const minutes = balance !== null && rate ? Math.min(15, Math.floor(balance / rate)) : null
  const short = voice ? minutes !== null && minutes < 1 : balance !== null && cost !== null && balance < cost.about
  const setup = voiceSetup(a, paste)

  async function start() {
    setError(null)
    setBusy(true)
    if (voice) {
      try {
        const thread = await createCareerThread()
        await call.start(thread.id, { mode: setup.mode, focus: setup.focus, role: setup.role, skill: a.target === "general" ? setup.skill : undefined, jobDescription: setup.jobDescription, context: { title: setup.title.slice(0, 160), focus: setup.focus, jobDescription: setup.jobDescription } })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the call")
      }
      setBusy(false)
      return
    }
    const req = startRequest(a, paste)
    if (!req) {
      setBusy(false)
      return setError("Something is missing. Go back and check your answers.")
    }
    try {
      const iv = await startInterview(req)
      invalidateCareerData()
      router.push(`/career/interviews/${iv.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the interview")
      setBusy(false)
    }
  }

  // A finished call with a scorecard becomes a result (kept in this browser, like other practice).
  const outcome = call.outcome
  useEffect(() => {
    if (call.phase !== "done" || !outcome?.scorecard) return
    const id = saveResult(voiceResult(outcome.scorecard, a, setup.title, Math.max(1, Math.round(outcome.seconds / 60))))
    invalidateCareerData()
    router.replace(`/career/results/${id}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the call is done
  }, [call.phase, outcome])

  // The last step: the call itself, in the page.
  if (call.phase === "live" || call.phase === "ending" || (call.phase === "done" && outcome?.scorecard))
    return (
      <FlowShell step={7} name="Interview" exit={<span />}>
        <div data-tour-state="interview-new.call" className="flex flex-col gap-4">
          <RunHeader
            title={setup.title}
            how="voice"
            style={a.style ?? "real"}
            progress={call.mode === "mock" ? <QuestionBar n={Math.max(call.asked, 1)} total={6} /> : <p className="text-xs font-semibold text-text-secondary tabular-nums">{call.asked > 0 ? `Question ${call.asked}` : "Starting…"}</p>}
            exit={
              <span data-tour="interview-call-timer" className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                {Math.floor(call.elapsed / 60)}:{String(call.elapsed % 60).padStart(2, "0")}
              </span>
            }
          />
          <div className={cn(CARD, "flex h-[min(640px,calc(100dvh-15rem))] min-h-[420px] flex-col overflow-hidden pt-4")}>
            <VoiceLive call={call} />
          </div>
        </div>
      </FlowShell>
    )
  if (call.phase === "done" && outcome)
    return (
      <FlowShell step={7} name="Interview">
        <div data-tour-state="interview-new.call-unscored" className={cn(CARD, "flex flex-col items-center gap-3 p-6 text-center sm:p-8")}>
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MicOff className="size-6" />
          </span>
          <h1 className="text-xl font-bold text-foreground">{outcome.exchanges === 0 ? "No answers recorded" : "No scorecard this time"}</h1>
          <p className="max-w-md text-sm text-text-secondary">{outcome.exchanges === 0 ? "The call ended before you answered, so there is nothing to score. Only the time you were on the call was charged." : UNSCORED[outcome.unscored ?? "failed"]}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" data-ai="interview.call.again" onClick={call.reset} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover">
              <RotateCcw className="size-4" />
              Try again
            </button>
            <Link href="/career/interviews" data-ai="interview.back" className={cn(OUTLINE_CTA, "h-11 rounded-xl px-4")}>
              Back to Interviews
            </Link>
          </div>
        </div>
      </FlowShell>
    )

  const connecting = call.phase === "connecting"
  const what = a.target === "job" ? "Job" : a.target === "general" ? "Role" : "Situation"
  return (
    <FlowShell step={6} name="Ready">
      <Question id="ready" tourState="interview-new.ready" title="Ready when you are" hint="Check it, then start. Nothing is charged until you press Start.">
        <div data-tour="interview-summary" className={cn(CARD, "relative isolate divide-y divide-divider overflow-hidden")}>
          <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_60%)]" />
          <Row label={what} value={a.target === "general" ? [a.role, a.skill].filter(Boolean).join(" · ") : a.target === "job" ? [a.job === "paste" ? paste?.title || a.jt : a.jt || "Your selected job", a.job === "paste" ? paste?.company || a.jc : a.jc].filter(Boolean).join(" · ") : title} step={a.target === "job" ? "job" : a.target === "situation" ? "format" : "role"} onEdit={onEdit} />
          {a.target === "job" && <Row label="Round" value={ROUNDS.find((r) => r.key === a.round)?.title} step="round" onEdit={onEdit} />}
          {a.target === "general" && <Row label="Questions" value={focusLabel(a.focus)} step="focus" onEdit={onEdit} />}
          {a.target === "situation" && <Row label="Role" value={a.role} step="role" onEdit={onEdit} />}
          {a.target !== "job" && a.notes && <Row label="Your notes" value={<span className="line-clamp-3 font-normal whitespace-pre-wrap text-text-secondary">{a.notes}</span>} step="role" onEdit={onEdit} />}
          <Row
            label="How"
            value={
              <span className="inline-flex items-center gap-1.5">
                {voice ? <Mic className="size-4 text-primary" /> : <PenLine className="size-4 text-primary" />}
                {voice ? "Out loud, a live call" : "In writing"}
              </span>
            }
            step="how"
            onEdit={onEdit}
          />
          <Row label="Style" value={STYLES.find((s) => s.key === a.style)?.title} step="style" onEdit={onEdit} />
          <Row label="Length" tour="interview-length" value={voice ? (len.questions ? `${len.questions} questions · ${len.minutes} minutes` : `As many questions as fit · ${len.minutes} minutes`) : `${len.questions} questions · ${len.minutes} minutes`} />
          <Row
            label="Cost"
            tour="interview-cost"
            value={
              <span className="flex flex-col gap-0.5">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Coins className="size-4 text-primary" />
                  {voice ? (rate ? `≈ ${formatTokens(rate)} Plato tokens a minute${scoreCost ? `, plus ≈ ${formatTokens(scoreCost)} for the scorecard` : ""}` : "Charged by the minute") : cost ? `About ${formatTokens(cost.about)} Plato tokens, up to ${formatTokens(cost.upTo)}` : "A few Plato tokens per question"}
                  <InfoTip text={voice ? "When the call starts, Plato sets aside tokens for the longest call your balance allows (15 minutes at most). When it ends, you're charged only for the minutes you used." : "Writing the questions, reading each answer (and any follow-up) and the scorecard are AI work. Follow-ups can take it toward the higher figure."} label="How this is charged" />
                </span>
                {balance !== null && (
                  <span className={cn("text-[12.5px] font-normal", short ? "text-warning-ink" : "text-text-secondary")}>
                    You have {formatTokens(balance)} tokens{voice && minutes !== null ? `: enough for ${minutes < 1 ? "less than a minute" : `up to ${minutes} minute${minutes === 1 ? "" : "s"}`}` : ""}.{short && tokens ? ` They refill on ${resetLabel(tokens.resetsAt)}.` : ""}
                  </span>
                )}
              </span>
            }
          />
        </div>
        {voice && <p className="text-[13px] text-text-secondary">Your browser will ask for the microphone. Headphones help. Plato speaks first; the call runs here, on this page.</p>}
        {(error || call.error) && (
          <p role="alert" className="text-sm text-destructive">
            {error ?? call.error}
          </p>
        )}
        <QuestionNav
          onBack={onBack}
          busy={busy || connecting}
          extra={
            short ? (
              <Link href="/tokens" data-ai="interview.new.tokens" className="text-[13px] font-semibold text-primary hover:underline">
                Get more tokens
              </Link>
            ) : undefined
          }
          next
          dataAi="interview.new.start"
          nextDisabled={voice ? minutes !== null && minutes < 1 : !startRequest(a, paste)}
          onNext={() => void start()}
          nextLabel={
            <>
              {busy || connecting ? <Loader2 className="size-4 animate-spin" /> : voice ? <Mic className="size-4" /> : null}
              {connecting ? "Connecting…" : busy ? (a.target === "job" ? "Reading the job post…" : "Writing your questions…") : voice ? "Start the call" : "Start the interview"}
              {!busy && !connecting && !voice && <ArrowRight className="size-4" />}
            </>
          }
        />
      </Question>
    </FlowShell>
  )
}

export default function NewInterviewPage() {
  return (
    <Suspense fallback={null}>
      <NewInterview />
    </Suspense>
  )
}

