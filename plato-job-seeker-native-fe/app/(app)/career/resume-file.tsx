"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { BadgeCheck, Download, Eye, FileText, Loader2, Pencil, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { approveResume, getCareerResume, type ResumeCard } from "@/lib/career/api"

// One fetch per resume, shared by the preview and the download.
const blobs = new Map<string, Promise<Blob>>()
function loadResume(id: string) {
  let p = blobs.get(id)
  if (!p) {
    p = getCareerResume(id)
    blobs.set(id, p)
    p.catch(() => blobs.delete(id))
  }
  return p
}

async function downloadResume(card: ResumeCard) {
  const url = URL.createObjectURL(await loadResume(card.resumeId))
  const a = document.createElement("a")
  a.href = url
  a.download = `${card.title}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const sizeLabel = (bytes?: number) => (bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : null)

// How well the resume's words match the job, the way an applicant tracking system reads it.
function AtsPanel({ ats }: { ats: NonNullable<ResumeCard["ats"]> }) {
  const tone = ats.score >= 75 ? "text-success" : ats.score >= 50 ? "text-warning" : "text-destructive"
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card/70 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-foreground">Keyword match for this job</span>
        <span className={cn("text-sm font-bold", tone)}>{ats.score}%</span>
      </div>
      {ats.headlineNote && <p className="text-muted-foreground">{ats.headlineNote}</p>}
      {ats.matched.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">On your resume</span>
          {ats.matched.map((t) => (
            <span key={t} className="rounded-full bg-success-soft px-2 py-0.5 text-success">
              {t}
            </span>
          ))}
        </div>
      )}
      {ats.missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Left off, nothing in your profile shows it</span>
          {ats.missing.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// The resume as a file in the chat: open it beside the conversation or save it.
function ResumeFileCard({ card, active, onPreview, onEdit }: { card: ResumeCard; active: boolean; onPreview: () => void; onEdit?: () => void }) {
  const [saving, setSaving] = useState(false)
  const [approved, setApproved] = useState(!!card.approved)
  const meta = [card.version ? `v${card.version}${card.edited ? " edited" : ""}` : null, "PDF", sizeLabel(card.size), card.template === "modern" ? "Modern" : card.template === "classic" ? "Classic" : null].filter(Boolean).join(" · ")
  return (
    <div className="flex max-w-md flex-col gap-2 pl-10">
      <div className={cn("flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm transition-colors", active && "border-primary/50 ring-1 ring-primary/30")}>
        <button type="button" onClick={onPreview} aria-label={`Preview ${card.title}`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <FileText className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{card.title}</span>
            <span className="block text-xs text-muted-foreground">{meta}</span>
          </span>
        </button>
        <Button variant="outline" size="sm" onClick={onPreview} className="gap-1.5">
          <Eye className="size-3.5" />
          Preview
        </Button>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="size-3.5" />
            Edit
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Download ${card.title}`}
          disabled={saving}
          onClick={() => {
            setSaving(true)
            downloadResume(card).finally(() => setSaving(false))
          }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
      </div>
      {card.version && (
        <button type="button" disabled={approved} onClick={() => approveResume(card.resumeId).then(() => setApproved(true)).catch(() => undefined)} className={cn("flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", approved ? "border-success/40 bg-success-soft text-success" : "text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
          <BadgeCheck className="size-3.5" />
          {approved ? "Approved for applications" : "Approve this version for applications"}
        </button>
      )}
      {card.ats && <AtsPanel ats={card.ats} />}
      {card.why && card.why.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-muted-foreground">
          {card.why.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Side panel beside the chat, like an artifact: the PDF itself, with save and close.
function ResumePreviewPanel({ card, onClose }: { card: ResumeCard; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let made: string | null = null
    loadResume(card.resumeId)
      .then((blob) => {
        if (cancelled) return
        made = URL.createObjectURL(blob)
        setUrl(made)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [card.resumeId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <motion.aside
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      aria-label={`Preview of ${card.title}`}
      className="relative z-20 flex w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-lg shadow-primary/10 max-lg:absolute max-lg:inset-0 lg:w-[46%] lg:max-w-[560px]"
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <FileText className="size-4 shrink-0 text-destructive" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{card.title}</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void downloadResume(card)}>
          <Download className="size-3.5" />
          Download
        </Button>
        <Button variant="ghost" size="sm" aria-label="Close preview" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 bg-muted/40">
        {url ? (
          <iframe title={card.title} src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="size-full" />
        ) : failed ? (
          <p className="p-6 text-sm text-destructive">Could not load the preview. Try downloading it instead.</p>
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
      </div>
    </motion.aside>
  )
}

export { ResumeFileCard, ResumePreviewPanel }
