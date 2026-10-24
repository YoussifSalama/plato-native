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
    <div className={`flex flex-col gap-3 rounded-lg border bg-card p-4 ${className ?? ""}`}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  )
}

function SidebarSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
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

function BuildProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  )
}

function ConfirmInformationSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <HeaderSkeleton />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
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

function PreferencesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <HeaderSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <SidebarSkeleton rows={6} />
    </div>
  )
}

function ReadySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <HeaderSkeleton />
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <CardSkeleton />
      </div>
      <SidebarSkeleton rows={7} />
    </div>
  )
}

export { BuildProfileSkeleton, ConfirmInformationSkeleton, PreferencesSkeleton, ReadySkeleton }
