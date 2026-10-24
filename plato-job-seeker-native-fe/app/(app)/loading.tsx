import { Skeleton } from "@/components/ui/skeleton"

// Shown instantly while a page of the app streams in, so navigation never looks frozen.
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-6 pt-6 pb-28 lg:pl-7" aria-busy="true">
      <Skeleton className="h-8 w-48 rounded-md" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
