import { ShieldCheck } from "lucide-react"

function SecureBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
      <ShieldCheck className="size-3.5" />
      Your data is private and secure
    </span>
  )
}

export { SecureBadge }
