"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function LocationEditor({
  value,
  onSave,
  onCancel,
}: {
  value: { city?: string; country?: string } | null
  onSave: (value: { city: string; country: string }) => void
  onCancel: () => void
}) {
  const [city, setCity] = useState(value?.city ?? "")
  const [country, setCountry] = useState(value?.country ?? "")

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">City</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Country</label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onSave({ city, country })}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export { LocationEditor }
