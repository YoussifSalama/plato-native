"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, Award, Check, FileText, IdCard, Loader2, Lock, Plus, ScrollText, Upload } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { PlatoMark } from "@/components/plato-orb"
import { BuildProfileSkeleton } from "@/components/onboarding-skeletons"
import { analyzeProfile, getProfile, listDocuments, replaceDocument, uploadDocument } from "@/lib/documents/api"
import type { DocumentType, JobSeekerDocument, JobSeekerProfile } from "@/lib/documents/schema"

// Step 1, screen 01: the CV (required) on the left, everything else an application might
// ask for on the right. Each tile is its own document type; supporting documents join the
// batch Plato read the CV from, so adding one never hides the CV.
type Tile = { key: string; title: string; hint: string; icon: typeof FileText; type: DocumentType; also?: DocumentType[] }
const TILES: Tile[] = [
  { key: "cover", title: "Cover letter", hint: "Plato adapts it for each job", icon: FileText, type: "COVER_LETTER" },
  { key: "portfolio", title: "Portfolio", hint: "A file or a link", icon: FileText, type: "PORTFOLIO" },
  { key: "certs", title: "Certificates", hint: "Degrees, courses, licenses", icon: Award, type: "CERTIFICATE", also: ["DEGREE"] },
  { key: "visa", title: "Work visa or permit", hint: "e.g. US visa, residence permit", icon: ScrollText, type: "WORK_PERMIT" },
  { key: "license", title: "Driver's license", hint: "Some jobs ask for it", icon: IdCard, type: "LICENSE" },
  { key: "passport", title: "Passport or ID", hint: "Only if a job asks for it", icon: IdCard, type: "ID_DOCUMENT" },
  { key: "refs", title: "Reference letters", hint: "From past managers", icon: FileText, type: "REFERENCE_LETTER" },
  { key: "other", title: "Something else", hint: "Any file a job might need", icon: Plus, type: "OTHER" },
]
// Documents saved before the tiles had their own types are OTHER, named "Portfolio · x.pdf".
const prefix = (t: Tile) => `${t.title} · `
const legacy = (d: JobSeekerDocument) => TILES.find((x) => x.type !== "OTHER" && d.type === "OTHER" && d.name?.startsWith(prefix(x)))
const tileDocs = (t: Tile, docs: JobSeekerDocument[]) => docs.filter((d) => d.type === t.type || !!t.also?.includes(d.type) || legacy(d)?.key === t.key).filter((d) => t.type !== "OTHER" || !legacy(d))
// What the profile analysis learns from; adding one after Plato read the CV means reading again.
const EVIDENCE: DocumentType[] = ["CERTIFICATE", "DEGREE", "LICENSE"]

// "Senior SCM & ERP Consultant, about 7 years, based in Cairo. Strongest areas: …"
function cvSummary(p: JobSeekerProfile) {
  const first = p.experiences?.[0]
  const starts = (p.experiences ?? []).map((x) => x.start_date && new Date(x.start_date).getFullYear()).filter(Boolean) as number[]
  const years = starts.length ? new Date().getFullYear() - Math.min(...starts) : null
  const where = p.location?.city ?? p.location?.country
  return {
    lead: first?.title ?? null,
    rest: [years ? `about ${years} years` : null, where ? `based in ${where}` : null].filter(Boolean).join(", "),
    strengths: (p.skills ?? []).slice(0, 3).join(", "),
  }
}

function BuildProfileStep({ onContinue }: { onContinue: () => void }) {
  const [docs, setDocs] = useState<JobSeekerDocument[] | null>(null)
  const [profile, setProfile] = useState<JobSeekerProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cvInput = useRef<HTMLInputElement>(null)
  const tileInput = useRef<HTMLInputElement>(null)
  const [tileFor, setTileFor] = useState<Tile | null>(null)
  const analyzedFor = useRef<string | null>(null)
  // Documents Plato had when it last read the profile.
  const [readDocs, setReadDocs] = useState<Set<string> | null>(null)

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch(() => setDocs([]))
    getProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoaded(true))
  }, [])

  const cv = docs?.find((d) => d.type === "CV_RESUME")
  const cvReady = cv?.status === "READY"

  // A CV still being read: check again until it is ready or fails.
  useEffect(() => {
    if (!cv || cvReady || cv.status === "FAILED") return
    const id = setInterval(() => listDocuments().then(setDocs).catch(() => undefined), 2500)
    return () => clearInterval(id)
  }, [cv, cvReady])

  // Once a CV is ready and Plato hasn't read this one yet, read it, so the summary shows here.
  useEffect(() => {
    if (!cv || !cvReady || !profileLoaded || analyzedFor.current === cv.id) return
    if (profile?.experiences?.length && analyzedFor.current === null) {
      analyzedFor.current = cv.id
      return
    }
    analyzedFor.current = cv.id
    setReading(true)
    const ids = new Set((docs ?? []).map((d) => d.id))
    analyzeProfile()
      .then((r) => (setProfile(r.profile), setReadDocs(ids)))
      .catch((e) => setError(e instanceof Error ? e.message : "Plato could not read the CV"))
      .finally(() => setReading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- docs are read for the snapshot only
  }, [cv, cvReady, profile, profileLoaded])

  // New certificates, degrees or licenses since the last read: read again, then go on.
  async function next() {
    const fresh = readDocs && (docs ?? []).some((d) => EVIDENCE.includes(d.type) && d.status === "READY" && !readDocs.has(d.id))
    if (!fresh) return onContinue()
    setReading(true)
    setError(null)
    try {
      await analyzeProfile()
      onContinue()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plato could not read your new documents")
    } finally {
      setReading(false)
    }
  }

  async function uploadCv(file: File) {
    setBusy("cv")
    setError(null)
    try {
      const doc = cv ? await replaceDocument(cv.id, file) : await uploadDocument(file, "CV_RESUME")
      analyzedFor.current = "new"
      setDocs((prev) => [...(prev ?? []).filter((d) => d.id !== doc.id && d.type !== "CV_RESUME"), doc])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setBusy(null)
    }
  }
  async function uploadTile(t: Tile, file: File) {
    setBusy(t.key)
    setError(null)
    try {
      const doc = await uploadDocument(file, t.type)
      setDocs((prev) => [...(prev ?? []), doc])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setBusy(null)
    }
  }

  if (docs === null) return <BuildProfileSkeleton />
  const added = TILES.filter((t) => tileDocs(t, docs).length > 0).length
  const summary = profile?.experiences?.length ? cvSummary(profile) : null

  return (
    <div className="mx-auto grid w-full max-w-[1300px] grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
      <input ref={cvInput} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => (e.target.files?.[0] && void uploadCv(e.target.files[0]), (e.target.value = ""))} />
      <input ref={tileInput} type="file" hidden onChange={(e) => (e.target.files?.[0] && tileFor && void uploadTile(tileFor, e.target.files[0]), (e.target.value = ""))} />

      {/* Left: the pitch, the CV and what Plato read in it. */}
      <section className="flex flex-col gap-5 lg:pt-16">
        <div>
          <h1 className="text-[34px] leading-[1.12] font-extrabold tracking-tight sm:text-[40px]">Give Plato everything an application might ask for</h1>
          <p className="mt-3 text-[16.5px] leading-relaxed text-text-secondary">Start with your CV. Add any other documents now, and Plato attaches the right one whenever a job asks for it, so you never stop mid-application to look for a file.</p>
        </div>

        <p className="mt-2 font-semibold">
          Resume / CV <span className="text-destructive">*</span>
        </p>
        {cv ? (
          <div className={cn("flex items-center gap-4 rounded-2xl border p-4", cv.status === "FAILED" ? "border-destructive/30 bg-danger-soft" : "border-success-line bg-[#f3fcf6]")}>
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", cv.status === "FAILED" ? "bg-card text-destructive" : "bg-success-soft text-success")}>{cvReady ? <Check className="size-5" /> : cv.status === "FAILED" ? <FileText className="size-5" /> : <Loader2 className="size-5 animate-spin" />}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[17px]">{cv.name ?? "Your CV"}</b>
              <span className={cn("text-[14.5px]", cv.status === "FAILED" ? "text-destructive" : "text-success-ink")}>{cv.status === "FAILED" ? (cv.processing_error ?? "Plato could not read this file. Try a PDF.") : cvReady ? "Read · experience, education and skills added to your profile" : "Reading your CV…"}</span>
            </span>
            <Button variant="outline" onClick={() => cvInput.current?.click()} disabled={busy === "cv"} className="h-11 rounded-xl bg-card px-4">
              {busy === "cv" && <Loader2 className="size-4 animate-spin" />}
              Replace
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => cvInput.current?.click()} disabled={busy === "cv"} className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary-line bg-primary-tint px-6 py-8 text-center transition-colors hover:bg-primary-soft">
            {busy === "cv" ? <Loader2 className="size-6 animate-spin text-primary" /> : <Upload className="size-6 text-primary" />}
            <b>Upload your CV</b>
            <span className="text-sm text-text-secondary">PDF or Word, up to 10 MB</span>
          </button>
        )}

        {cvReady && (
          <div className="flex gap-3 rounded-2xl border border-primary-line bg-primary-tint p-4">
            <PlatoMark size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold tracking-[0.04em] text-primary uppercase">Plato read your CV</p>
              {reading || !summary ? (
                <p className="mt-1 flex items-center gap-2 text-text-secondary">
                  <Loader2 className="size-4 animate-spin" />
                  Reading your experience…
                </p>
              ) : (
                <p className="mt-1 text-[16px] leading-relaxed">
                  {summary.lead && <b>{summary.lead}</b>}
                  {summary.rest && `, ${summary.rest}`}.{summary.strengths && ` Strongest areas: ${summary.strengths}.`}
                </p>
              )}
              <p className="mt-2 text-sm text-text-secondary">Next you&apos;ll set your preferences, including expected salary and notice period, so Plato never has to stop and ask you mid-application.</p>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-5">
          <Button data-ai="onboarding.continue" onClick={() => void next()} disabled={!cvReady || reading} className="h-14 gap-2 rounded-xl px-8 text-[17px]">
            Continue to preferences
            <ArrowRight className="size-5" />
          </Button>
          <span className="text-text-secondary">Only the CV is needed to continue.</span>
        </div>
      </section>

      {/* Right: every other file a job might ask for. */}
      <section className="flex flex-col gap-3 lg:pt-[106px]">
        <p className="flex items-center justify-between">
          <span className="text-[17px] font-semibold">
            Other documents <span className="font-normal text-text-secondary">(optional)</span>
          </span>
          <span className="text-text-secondary">{added} added</span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TILES.map((t) => {
            const has = tileDocs(t, docs).length > 0
            return (
              <div key={t.key} className={cn("flex items-center gap-3 rounded-2xl border p-4", has ? "border-success-line bg-[#f3fcf6]" : "bg-card")}>
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", has ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>{has ? <Check className="size-5" /> : <t.icon className="size-5" />}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[16px] leading-tight">{t.title}</b>
                  <span className="text-[14px] text-text-secondary">{t.hint}</span>
                </span>
                <button type="button" disabled={busy === t.key} onClick={() => (setTileFor(t), tileInput.current?.click())} className="flex h-10 shrink-0 items-center gap-1 rounded-xl border bg-card px-3.5 text-[15px] font-semibold text-primary transition-colors hover:border-primary-line">
                  {busy === t.key ? <Loader2 className="size-4 animate-spin" /> : has ? "Added" : "+ Add"}
                </button>
              </div>
            )
          })}
        </div>
        <p className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-[15px] text-text-secondary">
          <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
          Your documents are encrypted and private. Plato only attaches one when an application asks for it, and you can delete any of them from your profile.
        </p>
      </section>
    </div>
  )
}

export { BuildProfileStep }
