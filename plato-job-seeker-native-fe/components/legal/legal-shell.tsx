import type { ReactNode } from "react"
import Link from "next/link"
import { PlatoMark } from "@/components/plato-orb"

// Public legal pages (privacy, terms): no login, the product palette, a brand header, a table of contents on
// wide screens, prose sized to read. Sections come as { id, title, body } so the contents list and the anchors
// never drift apart.
export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

export function LegalShell({ title, lead, updated, sections, other }: { title: string; lead: string; updated: string; sections: LegalSection[]; other: { href: string; label: string } }) {
  return (
    <div className="theme-app min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Plato home">
            <PlatoMark size={30} />
            <span className="text-lg font-semibold">Plato</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/privacy" className={title.startsWith("Privacy") ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}>Privacy</Link>
            <Link href="/terms" className={title.startsWith("Terms") ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}>Terms</Link>
            <Link href="/login" className="rounded-lg bg-primary px-3.5 py-1.5 font-semibold text-primary-foreground hover:opacity-90">Open Plato</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="Contents" className="sticky top-24 text-sm">
            <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contents</p>
            <ol className="space-y-2 border-l pl-4">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">{s.title}</a>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-xs text-muted-foreground">
              See also <Link href={other.href} className="underline underline-offset-2 hover:text-foreground">{other.label}</Link>
            </p>
          </nav>
        </aside>

        <article className="max-w-2xl">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Plato · Legal</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{lead}</p>
          <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>

          <div className="mt-10 space-y-10 text-[15.5px] leading-7 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13.5px] [&_b]:font-semibold [&_b]:text-foreground">
            {sections.map((s) => (
              <section key={s.id} id={s.id}>
                <h2>{s.title}</h2>
                {s.body}
              </section>
            ))}
          </div>

          <footer className="mt-16 border-t pt-6 text-sm text-muted-foreground">
            <p>
              Questions: <a className="underline underline-offset-2" href="mailto:raefalwani06@gmail.com">raefalwani06@gmail.com</a> · <Link href={other.href} className="underline underline-offset-2">{other.label}</Link>
            </p>
          </footer>
        </article>
      </div>
    </div>
  )
}
