import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "cn"
import { NotificationBell } from "@/app/(app)/jobs/components/notification-bell"

// Every signed-in page starts the same way, so the seeker always knows where
// they are: a section label (or a breadcrumb back up the tree on sub-pages),
// the page title, one line on what the page is for, the page's own actions,
// and the page's own actions. The bell lives in the shell's top bar. Use PAGE for the container.

// pb-24 keeps the last card clear of the floating Plato AI launcher.
export const PAGE = "flex flex-1 flex-col gap-6 px-4 pt-5 pb-24 sm:px-6 lg:px-8 lg:pt-6"
// Pages with the Plato AI dock pinned over the bottom of the content.
export const PAGE_DOCK = "flex flex-1 flex-col gap-6 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-6"

export type Crumb = { label: string; href: string }

// "JOBS › SENIOR FRONTEND ROLES": the way back up, on every sub-page.
export function Breadcrumbs({ crumbs, current }: { crumbs: Crumb[]; current?: ReactNode }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-[11.5px] font-semibold tracking-[0.08em] uppercase">
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
  bell = false,
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
          {/* Sub-pages show the way back up. The old nav-group label (`section`) is no longer shown:
              the sidebar has no groups now, so it named nothing the seeker could see. */}
          {crumbs?.length ? <Breadcrumbs crumbs={crumbs} current={typeof title === "string" ? title : section} /> : null}
          <h1 className="type-page-title mt-1 truncate text-foreground">{title}</h1>
          {description && <p className="mt-1.5 max-w-[68ch] text-[15px] leading-relaxed text-text-secondary">{description}</p>}
        </div>
        {(actions || bell) && (
          <div data-tour="page-actions" className="flex flex-wrap items-center gap-2">
            {actions}
            {bell && <NotificationBell />}
          </div>
        )}
      </div>
      {children}
    </header>
  )
}
