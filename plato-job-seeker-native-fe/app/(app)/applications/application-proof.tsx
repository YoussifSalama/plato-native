"use client"

import { useEffect, useState } from "react"
import { Download, ImageOff, Loader2, Maximize2 } from "lucide-react"
import { getApplicationScreenshot } from "@/lib/jobs/api"

// The screenshot Plato took of the employer's confirmation (or of the filled
// form in a dry run). Served privately, so it is fetched and shown as a blob.
type ProofKind = "submitted" | "dryRun" | "failed"
const TITLE: Record<ProofKind, string> = { submitted: "Proof of application", dryRun: "Preview of the filled form", failed: "What the form looked like when it failed" }

function ApplicationProof({ applicationId, kind, fileName }: { applicationId: string; kind: ProofKind; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let revoke: string | null = null
    let alive = true
    getApplicationScreenshot(applicationId)
      .then((u) => {
        revoke = u
        if (alive) setUrl(u)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [applicationId])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">{TITLE[kind]}</p>
        {url && (
          <span className="flex items-center gap-1">
            <a href={url} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary-soft">
              <Maximize2 className="size-3.5" />
              Full size
            </a>
            <a href={url} download={fileName} className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary-soft">
              <Download className="size-3.5" />
              Download
            </a>
          </span>
        )}
      </div>
      {failed ? (
        <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-text-secondary">
          <ImageOff className="size-4" />
          The screenshot could not be loaded.
        </p>
      ) : url ? (
        // Long full-page capture: cap the height, scroll inside.
        <div className="scroll-thin max-h-96 overflow-y-auto rounded-md border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- private blob URL, not optimisable */}
          <img src={url} alt={TITLE[kind]} className="w-full" />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-md border bg-muted text-text-tertiary">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
    </div>
  )
}

export { ApplicationProof }
