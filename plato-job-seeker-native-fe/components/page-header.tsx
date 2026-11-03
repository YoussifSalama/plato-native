import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "cn"
import { NotificationBell } from "@/app/(app)/jobs/components/notification-bell"

// Every signed-in page starts the same way, so the seeker always knows where
// they are: a section label (or a breadcrumb back up the tree on sub-pages),
// the page title, one line on what the page is for, the page's own actions,
// and the notification bell in the same corner. Use PAGE for the container.

export const PAGE = "flex flex-1 flex-col gap-6 px-5 py-6 sm:px-6 lg:px-8"
// Pages with the Plato AI dock pinned over the bottom of the content.
export const PAGE_DOCK = "flex flex-1 flex-col gap-6 px-5 pt-6 pb-28 sm:px-6 lg:px-8"

export type Crumb = { label: string; href: string }

// "JOBS › SENIOR FRONTEND ROLES": the way back up, on every sub-page.
export function Breadcrumbs({ crumbs, current }: { crumbs: Crumb[]; current?: ReactNode }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-[11.5px] font-medium tracking-[0.06em] uppercase">
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1">
          <Link href={c.href} data-ai={`crumb.${c.label.toLowerCase().replace(/\s+/g, "-")}`} className="text-primary hover:underline">
            {c.label}
          </Link>
          <ChevronRight className="size-3 text-text-tertiary" aria-hidden />
        </span>
      ))}
      {current && (
        <span className="max-w-[40ch] truncate text-text-tertiary" aria-current="page">
          {current}
        </span>
      )}
    </nav>
  )
}

export function PageHeader({
  section,
  crumbs,
  title,
  description,
  actions,
  bell = true,
  children,
  className,
}: {
  section?: string
  crumbs?: Crumb[]
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  bell?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <header data-tour="page-header" className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          {crumbs?.length ? (
            <Breadcrumbs crumbs={crumbs} current={typeof title === "string" ? title : section} />
          ) : (
            section && <span className="eyebrow">{section}</span>
          )}
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>}
        </div>
        {(actions || bell) && (
          <div data-tour="page-actions" className="flex flex-wrap items-center gap-3">
            {actions}
            {bell && <NotificationBell />}
          </div>
        )}
      </div>
      {children}
    </header>
  )
}
