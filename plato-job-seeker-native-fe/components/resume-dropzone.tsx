"use client"

import { useId, useRef, useState } from "react"
import { CheckCircle2, Loader2, Upload } from "lucide-react"
import { cn } from "cn"
import type { JobSeekerDocument } from "@/lib/documents/schema"

function ResumeDropzone({
  document,
  onUpload,
}: {
  document: JobSeekerDocument | undefined
  onUpload: (file: File) => Promise<void>
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await onUpload(file)
    } catch {
      setError("Upload failed. Try again.")
    } finally {
      setUploading(false)
    }
  }

  const isReady = document?.status === "READY"
  const isFailed = document?.status === "FAILED"

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        void handleFile(e.dataTransfer.files?.[0])
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border",
        isReady && "border-primary/40 bg-primary/5"
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {uploading ? (
          <Loader2 className="size-6 animate-spin" />
        ) : isReady ? (
          <CheckCircle2 className="size-6" />
        ) : (
          <Upload className="size-6" />
        )}
      </span>

      {isReady ? (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">{document.name}</p>
          <p className="text-sm text-muted-foreground">Uploaded</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">Drag and drop your CV here</p>
          <p className="text-sm text-muted-foreground">PDF or DOCX, up to 10MB</p>
        </div>
      )}

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {isReady ? "Replace CV" : "Upload CV"}
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

      {isFailed && (
        <p className="text-sm text-destructive">
          {document.processing_error ?? "We couldn't read this file. Try another one."}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export { ResumeDropzone }
