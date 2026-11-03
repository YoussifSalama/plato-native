import Link from "next/link"
import { ArrowRight, Bell, FileText, Sparkles } from "lucide-react"
import { PAGE, PageHeader } from "@/components/page-header"

// A page that is not built yet still tells the seeker what it will be and
// where to go meanwhile, instead of a dead end.
function ComingSoonPage({ title, section = "Account", what = "We're still building this part of Plato.", meanwhile = DEFAULT_MEANWHILE }: { title: string; section?: string; what?: string; meanwhile?: { href: string; label: string; body: string; icon: typeof Bell }[] }) {
  return (
    <div className={PAGE}>
      <PageHeader section={section} title={title} description="Coming soon" />
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-10 text-center shadow-card">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Sparkles className="size-5" />
        </span>
        <p className="max-w-md text-sm text-text-secondary">{what}</p>
        <div className="mt-2 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {meanwhile.map(({ href, label, body, icon: Icon }) => (
            <Link key={href} href={href} className="group card-lift flex items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-card">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="block text-xs text-text-tertiary">{body}</span>
              </span>
              <ArrowRight className="mt-0.5 size-4 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

const DEFAULT_MEANWHILE = [
  { href: "/notifications", label: "Notifications", body: "Updates on your searches and applications.", icon: Bell },
  { href: "/applications", label: "Applications", body: "What each employer received, and anything that needs you.", icon: FileText },
]

export { ComingSoonPage }
