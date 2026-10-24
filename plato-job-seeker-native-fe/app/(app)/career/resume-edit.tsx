"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Loader2, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getResumeDoc, saveResumeEdits, suggestResumeText, type ResumeCard, type ResumeDocData } from "@/lib/career/api"

const field = "w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"

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
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Edit: {card.title}</p>
        <Button variant="ghost" size="sm" aria-label="Close editor" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {!doc && !error && <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />}
        {doc && (
          <>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Headline (the job title under your name)
              <input className={field} maxLength={80} value={doc.headline} onChange={(e) => set({ headline: e.target.value })} />
            </label>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                Summary
                {rewriteButton("summary", () => void rewrite("summary", { section: "summary" }, (r) => r.summary && set({ summary: r.summary })))}
              </div>
              <textarea className={field} rows={4} maxLength={700} value={doc.summary} onChange={(e) => set({ summary: e.target.value })} />
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Skills (comma separated)
              <textarea className={field} rows={3} value={skills} onChange={(e) => setSkills(e.target.value)} />
            </label>
            {(["experiences", "projects"] as const).map((key) =>
              doc[key].map((item, i) => (
                <div key={`${key}-${i}`} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="truncate">{"title" in item ? `${item.title}, ${item.company}` : item.name}</span>
                    {rewriteButton(`${key}-${i}`, () => void rewrite(`${key}-${i}`, { section: key === "experiences" ? "experience" : "project", index: i }, (r) => r.bullets && setBullets(key, i, r.bullets)))}
                  </div>
                  <textarea className={field} rows={Math.max(3, item.bullets.length + 1)} maxLength={2400} value={item.bullets.join("\n")} onChange={(e) => setBullets(key, i, e.target.value.split("\n"))} placeholder="One bullet per line" />
                </div>
              )),
            )}
            <p className="text-xs text-muted-foreground">Your edits are your own words. Plato checks the layout, not the facts, so keep it true.</p>
          </>
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
