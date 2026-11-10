import Link from "next/link"
import { ArrowRight, Bell, FileText, Sparkles } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CARD, StatIcon } from "@/components/plato-ui"

// A page that is not built yet still tells the seeker what it will be and
// where to go meanwhile, instead of a dead end.
function ComingSoonPage({ title, section = "Account", what = "We're still building this part of Plato.", meanwhile = DEFAULT_MEANWHILE }: { title: string; section?: string; what?: string; meanwhile?: { href: string; label: string; body: string; icon: typeof Bell }[] }) {
  return (
    <div className={PAGE}>
      <PageHeader section={section} title={title} description="Coming soon" />
      <div className={cn(CARD, "relative isolate flex flex-col items-center gap-4 overflow-hidden p-6 text-center sm:p-10")}>
        {/* The soft brand glow every page hero shares (cobalt top-left, azure bottom-right). */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_65%)]" />
        <StatIcon icon={Sparkles} accent="cobalt" className="size-12 rounded-2xl [&_svg]:size-5" />
        <p className="max-w-md text-sm text-text-secondary">{what}</p>
        <div data-tour="coming-soon-meanwhile" className="mt-2 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {meanwhile.map(({ href, label, body, icon: Icon }, i) => (
            <Link key={href} href={href} className="group card-lift flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-card animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <StatIcon icon={Icon} accent="cobalt" className="size-9 rounded-[10px] [&_svg]:size-4" />
              <span className="min-w-0 flex-1">
                <span className="type-card-title block text-foreground transition-colors duration-200 group-hover:text-primary">{label}</span>
                <span className="type-meta block text-text-tertiary">{body}</span>
              </span>
              <ArrowRight className="mt-0.5 size-4 text-text-tertiary transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
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
