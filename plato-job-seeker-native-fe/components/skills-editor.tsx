"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { TagInput } from "@/app/onboarding/components/tag-input"

function SkillsEditor({
  value,
  onSave,
  onCancel,
}: {
  value: string[]
  onSave: (value: string[]) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)

  return (
    <div className="flex flex-col gap-3">
      <TagInput value={draft} onChange={setDraft} placeholder="Add a skill, press Enter" />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onSave(draft)}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export { SkillsEditor }
