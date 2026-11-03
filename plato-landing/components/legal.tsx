import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT } from "./links";
import { Beams } from "./sections";

// Privacy and Terms, in the landing's own frame: short dark hero, then the paper surface with a sticky contents
// list and prose sized to read. Sections come as { id, title, body } so the contents and the anchors never drift.
export interface LegalSection { id: string; title: string; body: ReactNode }

export function Legal({ title, lead, updated, sections, other }: { title: string; lead: string; updated: string; sections: LegalSection[]; other: { href: string; label: string } }) {
  return (
    <main>
      <header className="hero short">
        <Beams n={2} />
        <div className="hero-center page-head" style={{ paddingBottom: 0 }}>
          <span className="badge"><b>Plato</b>Legal</span>
          <h1>{title}</h1>
          <p className="sub">{lead}</p>
        </div>
      </header>
      <section className="paper" style={{ marginTop: 16 }}>
        <div className="wrap legal">
          <aside>
            <nav aria-label="Contents">
              <p>Contents</p>
              <ol>{sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>
              <p className="also">See also <Link href={other.href}>{other.label}</Link></p>
            </nav>
          </aside>
          <article>
            <p className="updated">Last updated {updated}</p>
            <div style={{ marginTop: 28 }}>
              {sections.map((s) => <section key={s.id} id={s.id}><h2>{s.title}</h2>{s.body}</section>)}
            </div>
            <p className="end">Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a> · <Link href={other.href}>{other.label}</Link></p>
          </article>
        </div>
      </section>
    </main>
  );
}
