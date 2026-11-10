"use client"

import type { ComponentProps, ReactNode } from "react"
import { Check } from "lucide-react"
import { cn } from "cn"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// The two filter controls every list uses (Jobs, search results, Following, Career...):
// a chip that turns a filter on/off, and a pill that picks one value from a short list.
// Both are 36px pills; "on" / non-default reads as cobalt tint.
const PILL = "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
const ON = "border-primary-line bg-primary-soft text-primary"
const OFF = "bg-card text-foreground hover:border-primary-line"

// Extra button props (data-ai for the assistant and tours, disabled, title) pass through.
export function FilterChip({ on, onClick, children, className, ...rest }: { on: boolean; onClick: () => void; children: ReactNode; className?: string } & Omit<ComponentProps<"button">, "onClick" | "children" | "className">) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn(PILL, on ? ON : OFF, "disabled:pointer-events-none disabled:opacity-50", className)} {...rest}>
      {on && <Check className="size-3.5" />}
      {children}
    </button>
  )
}

export function FilterSelect<V extends string>({ label, value, onChange, options, defaultValue, className }: { label: string; value: V; onChange: (v: V) => void; options: readonly { value: V; label: string }[]; defaultValue?: V; className?: string }) {
  const active = value !== (defaultValue ?? options[0]?.value)
  return (
    <Select items={options} value={value} onValueChange={(v) => v != null && onChange(v as V)}>
      <SelectTrigger aria-label={label} className={cn(PILL, active ? ON : OFF, "h-9 pr-3 [&_svg]:text-current", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} sideOffset={6}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
