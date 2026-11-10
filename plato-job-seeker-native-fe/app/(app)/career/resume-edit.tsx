"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Loader2, PenLine, RefreshCw, X } from "lucide-react"
import { StatIcon } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getResumeDoc, saveResumeEdits, suggestResumeText, type ResumeCard, type ResumeDocData } from "@/lib/career/api"

// Review and edit the wording of a built resume. Employers, titles and dates are
// not editable here (they come from your profile). Saving makes a new version.
function ResumeEditPanel({ card, onClose, onSaved }: { card: ResumeCard; onClose: () => void; onSaved: (card: ResumeCard) => void }) {
  const [doc, setDoc] = useState<ResumeDocData | null>(null)
  const [skills, setSkills] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getResumeDoc(card.resumeId)
      .then((r) => {
        if (cancelled) return
        setDoc(r.doc)
        setSkills(r.doc.skills.join(", "))
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not open this resume"))
    return () => {
      cancelled = true
    }
  }, [card.resumeId])

  const set = (patch: Partial<ResumeDocData>) => setDoc((d) => d && { ...d, ...patch })
  const setBullets = (key: "experiences" | "projects", i: number, bullets: string[]) => setDoc((d) => d && { ...d, [key]: d[key].map((x, j) => (j === i ? { ...x, bullets } : x)) })

  async function rewrite(label: string, req: Parameters<typeof suggestResumeText>[1], apply: (r: { summary?: string; bullets?: string[] }) => void) {
    setBusy(label)
    setError(null)
    try {
      apply(await suggestResumeText(card.resumeId, req))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rewrite that")
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!doc) return
    setBusy("save")
    setError(null)
    try {
      const clean = (b: string[]) => b.map((x) => x.trim()).filter(Boolean)
      const { card: saved } = await saveResumeEdits(card.resumeId, {
        headline: doc.headline,
        summary: doc.summary,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        experiences: doc.experiences.map((e) => ({ bullets: clean(e.bullets) })),
        projects: doc.projects.map((p) => ({ bullets: clean(p.bullets) })),
      })
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save")
      setBusy(null)
    }
  }

  const rewriteButton = (id: string, onClick: () => void) => (
    <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={onClick} className="gap-1.5 text-xs">
      {busy === id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      Rewrite
    </Button>
  )

  return (
    <motion.aside initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} aria-label={`Edit ${card.title}`} className="relative z-20 flex w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-lg shadow-primary/10 max-lg:absolute max-lg:inset-0 lg:w-[46%] lg:max-w-[560px]">
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <StatIcon icon={PenLine} accent="green" className="size-8 rounded-lg [&_svg]:size-4" />
        <p className="type-card-title min-w-0 flex-1 truncate text-foreground">Edit: {card.title}</p>
        <Button variant="ghost" size="sm" aria-label="Close editor" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {!doc && !error && (
          <div aria-busy="true" className="flex flex-col gap-5">
            {[1, 4, 3, 5].map((rows, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="w-full rounded-md" style={{ height: rows === 1 ? 36 : rows * 20 + 16 }} />
              </div>
            ))}
          </div>
        )}
        {doc && (
          <div className="flex flex-col gap-5 animate-in fade-in-0 duration-300">
            <Field className="gap-1.5">
              <FieldLabel htmlFor="resume-headline" className="text-xs font-semibold text-muted-foreground">Headline (the job title under your name)</FieldLabel>
              <Input id="resume-headline" maxLength={80} value={doc.headline} onChange={(e) => set({ headline: e.target.value })} />
            </Field>
            <Field className="gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="resume-summary" className="text-xs font-semibold text-muted-foreground">Summary</FieldLabel>
                {rewriteButton("summary", () => void rewrite("summary", { section: "summary" }, (r) => r.summary && set({ summary: r.summary })))}
              </div>
              <Textarea id="resume-summary" rows={4} maxLength={700} value={doc.summary} onChange={(e) => set({ summary: e.target.value })} />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="resume-skills" className="text-xs font-semibold text-muted-foreground">Skills (comma separated)</FieldLabel>
              <Textarea id="resume-skills" rows={3} value={skills} onChange={(e) => setSkills(e.target.value)} />
            </Field>
            {(["experiences", "projects"] as const).map((key) =>
              doc[key].map((item, i) => (
                <Field key={`${key}-${i}`} className="gap-1.5">
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor={`resume-${key}-${i}`} className="block truncate text-xs font-semibold text-muted-foreground">{"title" in item ? `${item.title}, ${item.company}` : item.name}</FieldLabel>
                    {rewriteButton(`${key}-${i}`, () => void rewrite(`${key}-${i}`, { section: key === "experiences" ? "experience" : "project", index: i }, (r) => r.bullets && setBullets(key, i, r.bullets)))}
                  </div>
                  <Textarea id={`resume-${key}-${i}`} rows={Math.max(3, item.bullets.length + 1)} maxLength={2400} value={item.bullets.join("\n")} onChange={(e) => setBullets(key, i, e.target.value.split("\n"))} placeholder="One bullet per line" />
                </Field>
              )),
            )}
            <p className="text-xs text-muted-foreground">Your edits are your own words. Plato checks the layout, not the facts, so keep it true.</p>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t p-3">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!doc || !!busy} onClick={() => void save()} className="gap-1.5">
          {busy === "save" && <Loader2 className="size-4 animate-spin" />}
          Save as new version
        </Button>
      </footer>
    </motion.aside>
  )
}

export { ResumeEditPanel }
