"use client"

import { useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

function TagInput({
  value,
  onChange,
  max,
  placeholder,
}: {
  value: string[]
  onChange: (value: string[]) => void
  max?: number
  placeholder?: string
}) {
  const [draft, setDraft] = useState("")

  function addTag() {
    const tag = draft.trim()
    if (!tag) return
    if (value.includes(tag)) {
      setDraft("")
      return
    }
    if (max && value.length >= max) return
    onChange([...value, tag])
    setDraft("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      addTag()
    } else if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="ml-0.5 rounded-full hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={draft ? undefined : placeholder}
        className="h-6 w-auto min-w-24 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
    </div>
  )
}

export { TagInput }
