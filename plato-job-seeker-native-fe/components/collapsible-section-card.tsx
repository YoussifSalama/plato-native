"use client"

import type { ReactNode } from "react"
import { motion } from "motion/react"
import { ChevronDown, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "cn"
import { ICON_COLORS, type IconColor } from "@/lib/icon-colors"
import type { SectionStatus } from "@/lib/documents/schema"

function StatusBadge({ status }: { status: SectionStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "LOOKS_GOOD" ? "border-success/25 bg-success-soft text-success" : "border-warning/25 bg-warning-soft text-warning"
      )}
    >
      {status === "LOOKS_GOOD" ? "Looks good" : "Needs review"}
    </Badge>
  )
}

function CollapsibleSectionCard({
  icon: Icon,
  iconColor,
  label,
  summary,
  status,
  expanded,
  onToggleExpand,
  editing,
  onEdit,
  children,
}: {
  icon: LucideIcon
  iconColor: IconColor
  label: string
  summary: string
  status: SectionStatus
  expanded: boolean
  onToggleExpand: () => void
  editing: boolean
  onEdit: () => void
  children?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ICON_COLORS[iconColor])}>
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="truncate text-xs text-muted-foreground">{summary}</span>
        </div>
        <StatusBadge status={status} />
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="text-muted-foreground">
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-t px-3 pb-3"
        >
          <div className="pt-3">{children}</div>
          {!editing && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onEdit}>
              {status === "NEEDS_ATTENTION" ? "Review" : "Edit"}
            </Button>
          )}
        </motion.div>
      )}
    </div>
  )
}

export { CollapsibleSectionCard }
