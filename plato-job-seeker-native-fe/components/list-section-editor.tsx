"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type FieldConfig<T> = {
  key: keyof T
  label: string
  type?: "text" | "date" | "textarea"
}

function ListSectionEditor<T extends Record<string, unknown>>({
  fields,
  items,
  emptyItem,
  onSave,
  onCancel,
}: {
  fields: FieldConfig<T>[]
  items: T[]
  emptyItem: T
  onSave: (items: T[]) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<T[]>(items.length ? items : [emptyItem])

  function updateField(index: number, key: keyof T, value: string) {
    setDraft((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)))
  }

  function removeRow(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index))
  }

  function addRow() {
    setDraft((prev) => [...prev, emptyItem])
  }

  return (
    <div className="flex flex-col gap-4">
      {draft.map((item, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={String(field.key)} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                  {field.type === "textarea" ? (
                    <Textarea
                      value={(item[field.key] as string) ?? ""}
                      onChange={(e) => updateField(index, field.key, e.target.value)}
                      className="min-h-16 text-sm"
                    />
                  ) : (
                    <Input
                      type={field.type === "date" ? "date" : "text"}
                      value={((item[field.key] as string) ?? "").slice(0, 10)}
                      onChange={(e) => updateField(index, field.key, e.target.value)}
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              aria-label="Remove entry"
              onClick={() => removeRow(index)}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={addRow}>
        <Plus className="size-3.5" />
        Add
      </Button>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(draft.filter((item) => fields.some((f) => item[f.key])))}
        >
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export { ListSectionEditor }
