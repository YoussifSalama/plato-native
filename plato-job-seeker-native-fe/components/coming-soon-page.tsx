import { Construction } from "lucide-react"

function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-sm border bg-card p-12 text-center">
        <Construction className="size-8 text-muted-foreground" />
        <p className="font-medium text-foreground">Coming soon</p>
        <p className="text-sm text-muted-foreground">We&apos;re still building this part of Plato.</p>
      </div>
    </div>
  )
}

export { ComingSoonPage }
