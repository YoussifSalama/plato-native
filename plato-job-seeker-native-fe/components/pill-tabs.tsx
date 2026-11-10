"use client"

import { motion } from "motion/react"
import type { LucideIcon } from "lucide-react"
import { cn } from "cn"
import { spring } from "@/lib/motion-system"

// The tab strip from the tokens History section (All / Spent / Added): a muted
// pill track with a card-coloured pill that slides under the active tab.
// Every tab navigator in the app uses this one, so they all move the same way.
export type PillTab<K extends string> = { key: K; label: string; count?: number; attention?: boolean; icon?: LucideIcon }

export function PillTabs<K extends string>({ id, tabs, value, onChange, label, dataAi, className }: { id: string; tabs: readonly PillTab<K>[]; value: K; onChange: (key: K) => void; label: string; dataAi: string; className?: string }) {
  return (
    <div className={cn("no-scrollbar flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-muted p-1", className)} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-ai={`${dataAi}.${t.key}`}
            onClick={() => onChange(t.key)}
            className={cn("relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors", active ? "text-primary" : t.attention ? "text-warning hover:text-foreground" : "text-text-secondary hover:text-foreground")}
          >
            {active && <motion.span layoutId={id} transition={spring.micro} className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(14_27_44/0.08)] ring-1 ring-border/70" />}
            {t.icon && <t.icon className="relative size-3.5" strokeWidth={2} />}
            <span className="relative">{t.label}</span>
            {t.count !== undefined && <span className="relative text-[11.5px] tabular-nums opacity-70">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
