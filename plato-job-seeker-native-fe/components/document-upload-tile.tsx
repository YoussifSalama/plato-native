"use client"

import { useId, useRef, useState } from "react"
import { Loader2, Upload, X, type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "cn"
import type { DocumentType, JobSeekerDocument } from "@/lib/documents/schema"
import { ICON_COLORS, type IconColor } from "@/lib/icon-colors"

function DocumentUploadTile({
  icon: Icon,
  title,
  description,
  documents,
  onUpload,
  onDelete,
  color = "violet",
}: {
  icon: LucideIcon
  title: string
  description: string
  documents: JobSeekerDocument[]
  onUpload: (file: File) => Promise<void>
  onDelete: (id: string) => Promise<void>
  color?: IconColor
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await onUpload(file)
    } catch {
      setError("Upload failed.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <Card className="h-full">
      <CardContent>
        <div className="flex items-start gap-3">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", ICON_COLORS[color])}>
            <Icon className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </div>
          <button
            type="button"
            aria-label={`Upload ${title}`}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
          </button>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            disabled={uploading}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>

        {documents.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {documents.map((doc) => {
              return (
                <li
                  key={doc.id}
                  className={cn(
                    "flex items-center justify-between gap-2 truncate rounded-md bg-muted px-2 py-1 text-xs",
                    doc.status === "FAILED" && "text-destructive"
                  )}
                >
                  <span className="truncate">{doc.name ?? "document"}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Remove ${doc.name}`}
                      onClick={() => void onDelete(doc.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>)
            })}
          </ul>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export { DocumentUploadTile }
export type { DocumentType }
