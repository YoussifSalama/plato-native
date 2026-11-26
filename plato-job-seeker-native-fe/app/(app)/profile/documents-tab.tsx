"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, FileText, FolderOpen, Loader2, Puzzle, Upload } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "cn"
import { CARD, EmptyState, StatIcon, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { FormSelect } from "@/app/onboarding/steps/preferences"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { deleteDocument, getDocumentFile, listDocuments, replaceDocument, uploadDocument } from "@/lib/documents/api"
import { acceptFor, type DocumentType, type JobSeekerDocument } from "@/lib/documents/schema"
import { Card, ROW } from "./profile-editor"

export const DOC_LABEL: Record<DocumentType, string> = { CV_RESUME: "Resume / CV", CERTIFICATE: "Certificate", LICENSE: "License", DEGREE: "Degree", OTHER: "Other document", COVER_LETTER: "Cover letter", PORTFOLIO: "Portfolio", WORK_PERMIT: "Work visa or permit", ID_DOCUMENT: "Passport or ID", REFERENCE_LETTER: "Reference letter" }
const SOFT = "inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
const QUIET = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-text-secondary transition-colors duration-200 hover:bg-danger-soft hover:text-destructive disabled:opacity-50"

// The file as uploaded, in a new tab, or saved under its own name.
export async function openFile(id: string, name?: string | null) {
  const url = URL.createObjectURL(await getDocumentFile(id))
  if (!name) {
    window.open(url, "_blank", "noopener")
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  Object.assign(document.createElement("a"), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Profile → Documents: every file Plato can attach, each with Preview, Replace and Delete.
export function DocumentsTab({ linked, onChanged }: { linked: boolean | null; onChanged: () => void }) {
  const [docs, setDocs] = useState<JobSeekerDocument[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<JobSeekerDocument | null>(null)
  const [addType, setAddType] = useState<DocumentType>("CV_RESUME")
  const replaceInput = useRef<HTMLInputElement>(null)
  const addInput = useRef<HTMLInputElement>(null)
  const replacing = useRef<JobSeekerDocument | null>(null)

  // A failed load is not "no documents": saying so would invite a second CV upload.
  const [loadFailed, setLoadFailed] = useState(false)
  const load = useCallback(
    () =>
      listDocuments()
        .then((d) => (setLoadFailed(false), setDocs(d)))
        .catch(() => setLoadFailed(true)),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])
  const hasCv = !!docs?.some((d) => d.type === "CV_RESUME")
  // One CV at a time: once there is one, it is replaced from its row.
  const types = (Object.keys(DOC_LABEL) as DocumentType[]).filter((t) => t !== "CV_RESUME" || !hasCv)
  const type = types.includes(addType) ? addType : types[0]

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key)
    setError(null)
    try {
      await action()
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }
  function pickReplacement(d: JobSeekerDocument) {
    replacing.current = d
    const input = replaceInput.current
    if (!input) return
    input.accept = acceptFor(d.type)
    input.click()
  }
  function onReplace(file: File | undefined) {
    const d = replacing.current
    if (!file || !d) return
    // No replacements left on a CV: it goes in as a new CV, which Plato reads from scratch.
    void run(d.id, () => (d.remaining_replacements === 0 && d.type === "CV_RESUME" ? uploadDocument(file, "CV_RESUME") : replaceDocument(d.id, file)))
  }

  return (
    <div className="flex flex-col gap-4">
      <input ref={replaceInput} type="file" hidden onChange={(e) => (onReplace(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={addInput} type="file" hidden accept={acceptFor(type)} onChange={(e) => (e.target.files?.[0] && void run("add", () => uploadDocument(e.target.files![0], type)), (e.target.value = ""))} />
      <Card title="Documents" icon={FolderOpen} tour="profile-documents">
        <div className="flex flex-wrap items-center gap-2">
          <FormSelect label="Document type" value={type} onChange={(v) => setAddType(v as DocumentType)} options={types.map((t) => ({ value: t, label: DOC_LABEL[t] }))} className="w-52" />
          <button type="button" data-tour="profile-add-documents" data-ai="profile.add-document" disabled={busy === "add"} onClick={() => addInput.current?.click()} className={SOFT}>
            {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Add {DOC_LABEL[type].toLowerCase()}
          </button>
          <span className="text-[13px] text-text-tertiary">{acceptFor(type).includes("png") ? "PDF, Word, JPG or PNG" : "PDF or Word (.docx)"}, up to 10 MB</span>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loadFailed && (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            Plato could not load your documents.
            <button type="button" onClick={() => void load()} className="font-semibold text-primary hover:underline">
              Try again
            </button>
          </p>
        )}
        {docs === null && !loadFailed && <Skeleton className="h-24 rounded-xl" />}
        {docs?.length === 0 && <EmptyState icon={FolderOpen} title="No documents yet" hint="Add your CV first: Plato reads it into your profile and fills in the rest." />}
        <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="-mx-2 flex flex-col divide-y divide-divider">
          {docs?.map((d) => {
            const left = d.remaining_replacements
            const out = left === 0 && d.type !== "CV_RESUME" && d.status === "READY"
            return (
              <motion.li key={d.id} variants={fadeUpItem} className={cn("flex flex-wrap items-center gap-3 rounded-lg px-2 py-2.5", ROW)}>
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px]", d.status === "READY" ? "bg-success-soft text-success" : d.status === "FAILED" ? "bg-danger-soft text-destructive" : "bg-primary-soft text-primary")}>{d.status === "READY" ? <Check className="size-4" /> : <FileText className="size-4" />}</span>
                <span className="min-w-[160px] flex-1">
                  <b className="block truncate" title={d.name ?? undefined}>
                    {d.name ?? DOC_LABEL[d.type]}
                  </b>
                  <span className="type-meta text-text-secondary">
                    {[DOC_LABEL[d.type], d.status === "FAILED" ? (d.processing_error ?? "Plato could not read this file") : null, left === undefined || d.status !== "READY" ? null : left ? `${left} replacement${left === 1 ? "" : "s"} left` : d.type === "CV_RESUME" ? "No replacements left: a new CV is read from scratch" : "No replacements left: delete it, then add the new one"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {d.status === "FAILED" && <StatusPill tone="danger">Could not read</StatusPill>}
                <span className="ml-auto flex items-center gap-1.5">
                  <button type="button" data-ai={`profile.preview-document:${d.id}`} onClick={() => void openFile(d.id).catch(() => setError("Could not open that file. Try again."))} className={SOFT}>
                    Preview
                  </button>
                  <button type="button" data-ai={`profile.replace-document:${d.id}`} disabled={busy === d.id || out} title={out ? "No replacements left: delete it, then add the new one" : undefined} onClick={() => pickReplacement(d)} className={SOFT}>
                    {busy === d.id && <Loader2 className="size-3.5 animate-spin" />}
                    {left === 0 && d.type === "CV_RESUME" && d.status === "READY" ? "Upload new CV" : "Replace"}
                  </button>
                  <button type="button" data-ai={`profile.delete-document:${d.id}`} disabled={busy === d.id} onClick={() => setConfirm(d)} className={QUIET}>
                    Delete
                  </button>
                </span>
              </motion.li>
            )
          })}
        </motion.ul>
      </Card>
      <ConfirmDialog
        open={!!confirm}
        title={`Delete ${confirm?.name ?? "this document"}?`}
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const d = confirm
          setConfirm(null)
          if (d) void run(d.id, () => deleteDocument(d.id))
        }}
      >
        {confirm?.type === "CV_RESUME" ? "Plato stops using this CV on applications, and no older CV takes its place. Your profile stays as it is until you add a new CV." : "Plato stops attaching it to applications. This can't be undone."}
      </ConfirmDialog>
      <section data-tour="profile-extension" className={cn(CARD, "flex flex-wrap items-center gap-3 p-5 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500")} style={{ animationDelay: "70ms" }}>
        <StatIcon icon={Puzzle} accent="cobalt" className="size-10" />
        <span className="min-w-0 flex-1">
          <b className="type-card-title block">Plato Apply in Chrome</b>
          <span className="flex items-center gap-1.5 text-sm text-text-secondary">
            {linked !== null && <span className={cn("size-1.5 rounded-full", linked ? "bg-success" : "bg-text-tertiary")} />}
            {linked === null ? "Checking…" : linked ? "Linked to your account" : "Not linked yet"}
          </span>
        </span>
        <Link href="/extension" className={cn(SOFT, "group")}>
          {linked ? "Manage browsers" : "Link a browser"}
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </section>
    </div>
  )
}
