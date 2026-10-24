import { Construction } from "lucide-react"

function ComingSoonStep() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-12 text-center">
      <Construction className="size-8 text-muted-foreground" />
      <p className="font-medium text-foreground">This step is coming soon</p>
      <p className="text-sm text-muted-foreground">We&apos;re still building this part of onboarding.</p>
    </div>
  )
}

export { ComingSoonStep }
