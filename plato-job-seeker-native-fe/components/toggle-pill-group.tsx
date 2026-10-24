"use client"

import type { LucideIcon } from "lucide-react"
import { Check } from "lucide-react"
import { cn } from "cn"

type Option = { value: string; label: string; icon?: LucideIcon }

function TogglePillGroup({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  function toggle(optionValue: string) {
    onChange(value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value.includes(option.value)
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {selected ? <Check className="size-3.5" /> : Icon ? <Icon className="size-3.5" /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { TogglePillGroup }
