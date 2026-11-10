import { Skeleton } from "@/components/ui/skeleton"

function HeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-6 w-32 rounded-full" />
    </div>
  )
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border bg-card shadow-card p-4 ${className ?? ""}`}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  )
}

function SidebarSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card shadow-card p-4">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-3 w-48" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Skeletons fade in gently so a fast load never flashes grey blocks.
const CALM = "animate-in fade-in-0 fill-mode-both delay-150 duration-500"

// Matches step 1: the pitch and the CV on the left, the eight document tiles on the right.
function BuildProfileSkeleton() {
  return (
    <div className={`mx-auto grid w-full max-w-[1300px] grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-12 ${CALM}`}>
      <div className="flex flex-col gap-5 lg:pt-16">
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-10 w-3/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <div className="mt-2 flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-14 w-60 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3 lg:pt-[106px]">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-card">
              <Skeleton className="size-11 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-10 w-16 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ConfirmInformationSkeleton() {
  return (
    <div className={`grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] ${CALM}`}>
      <div className="flex flex-col gap-6">
        <HeaderSkeleton />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card shadow-card p-3">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <div className="flex flex-col gap-4">
        <SidebarSkeleton rows={3} />
        <SidebarSkeleton rows={3} />
      </div>
    </div>
  )
}

// Matches the step's three columns: a header with the actions, then three cards of groups.
function PreferencesSkeleton() {
  return (
    <div className={`flex flex-col gap-6 ${CALM}`}>
      <HeaderSkeleton />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        {[4, 3, 5].map((groups, c) => (
          <div key={c} className="flex flex-col gap-6 rounded-2xl border bg-card p-5 shadow-card">
            {Array.from({ length: groups }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-8 w-20 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReadySkeleton() {
  return (
    <div className={`grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] ${CALM}`}>
      <div className="flex flex-col gap-6">
        <HeaderSkeleton />
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <CardSkeleton />
      </div>
      <SidebarSkeleton rows={7} />
    </div>
  )
}

export { BuildProfileSkeleton, ConfirmInformationSkeleton, PreferencesSkeleton, ReadySkeleton }
