import type { ReactNode } from "react";
import { PACKS, PLANS, SEARCH, SOURCES } from "./links";

export function Beams({ n = 4 }: { n?: number }) {
  return <>{["b1", "b2", "b3", "b4"].slice(0, n).map((b) => <span key={b} className={`beam ${b}`} aria-hidden />)}</>;
}

export function PageHero({ eyebrow, title, sub, children }: { eyebrow: string; title: ReactNode; sub: string; children?: ReactNode }) {
  return (
    <header className="hero short">
      <Beams n={3} />
      <div className="hero-center page-head" style={{ paddingBottom: 0 }}>
        <span className="badge"><b>Plato</b>{eyebrow}</span>
        <h1>{title}</h1>
        <p className="sub">{sub}</p>
        {children}
      </div>
    </header>
  );
}

export function Marquee() {
  const row = [...SOURCES, ...SOURCES];
  return (
    <div className="marquee" aria-label="Job sources Plato searches">
      <div className="lbl">One search across the boards for your country</div>
      <div className="track">
        {row.map(([n, c], i) => <span className="src" key={i}><i style={{ background: c }}>{n[0]}</i>{n}</span>)}
      </div>
    </div>
  );
}

export const RULES: [string, string][] = [
  ["Only the jobs you picked", "Plato applies to the jobs you chose, up to ten in a batch, and nothing else."],
  ["One Submit per application", "The limit is enforced in the extension's code, not left to the AI. One press, then it moves on."],
  ["Human checks stay yours", "When a site asks you to prove you're human, Plato stops and tells you which tab."],
  ["It asks instead of guessing about you", "A question your CV and profile can't answer comes to you. Your answer is saved for next time."],
  ["Sent means confirmed", "An application counts as sent only when the site's own confirmation is on the page, or when you confirm it."],
  ["The extension talks only to Plato", "Its network access is fixed to Plato's server in its security policy. No analytics, no third-party code."],
];

export function Rules({ title = "The rules Plato follows on every application." }: { title?: string }) {
  return (
    <section className="sec">
      <div className="wrap">
        <span className="eyebrow">Rules</span>
        <h2 className="h2" style={{ maxWidth: "16ch" }}>{title}</h2>
        <div className="rules">{RULES.map(([b, s]) => <div key={b}><b>{b}</b><span>{s}</span></div>)}</div>
      </div>
    </section>
  );
}

export function Plans() {
  return (
    <>
      <div className="plans">
        {PLANS.map((p) => (
          <div className={`plan${p.hi ? " hi" : ""}`} key={p.id}>
            <span className="name">{p.name}</span>
            <div className="price num">${p.price}<small> / month</small></div>
            <div className="tok num">{p.tokens} tokens every month</div>
            <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            {p.soon ? (
              <span className={`btn ${p.hi ? "white" : "ghost-dark"}`} aria-disabled="true" style={{ opacity: 0.55, cursor: "default" }}>{p.cta}</span>
            ) : (
              <a className={`btn ${p.hi ? "white" : "ghost-dark"}`} href={SEARCH}>{p.cta}</a>
            )}
          </div>
        ))}
      </div>
      <div className="packs">{PACKS.map(([t, usd]) => <div className="pack" key={t}><span>Top-up · <b className="num">{t}</b> tokens</span><b className="num">${usd}</b></div>)}</div>
    </>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return <div className="faq">{items.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>)}</div>;
}

export function Closing({ title = "Start with your CV." }: { title?: string }) {
  return (
    <section className="sec">
      <div className="closing">
        <Beams n={2} />
        <span className="eyebrow">Free first search</span>
        <h2 className="h2">{title}</h2>
        <p className="lead" style={{ marginInline: "auto" }}>Upload it and see the jobs that fit you. No account needed; sign up later and your CV and results come with you.</p>
        <div className="cta"><a className="btn white lg" href={SEARCH}>Find jobs from your CV</a><a className="btn text" href="#story">See how it works</a></div>
      </div>
    </section>
  );
}

export const FAQ_HOME: [string, string][] = [
  ["Do I need an account to try it?", "No. Upload your CV and Plato runs a first search on LinkedIn for the roles in it, from the last 30 days. You see your two best matches free; sign up to see all of them and apply. Your CV and the search come with you."],
  ["Which job boards does Plato search?", "LinkedIn, Indeed, Google Jobs, Glassdoor, Wuzzuf, Bayt, GulfTalent, Greenhouse, Lever, Ashby, Workable, remote-job boards and more. Which ones a search reaches depends on your country. Only postings from the last 30 days, with duplicates merged."],
  ["Does Plato press Submit for me?", "Yes, once per application, in a tab you can see. Pick up to ten jobs and press Start; the Chrome extension fills each form from your profile and submits it. It stops for anything it can't answer and for human checks."],
  ["Which sites can it apply on?", "Jobs that start on Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Recruitee, Teamtailor, Personio, JazzHR, LinkedIn, Indeed and Wuzzuf, including when the posting continues on the employer's own careers site."],
  ["Does it create accounts on job sites?", "When a site needs an account to apply, Plato can create one for you and sign in to it later. It stops and hands over to you for email codes, single sign-on, or accounts it didn't create. You can turn this off in your apply settings."],
  ["What does it cost?", "Applying costs nothing. Searching, ranking, CVs and interviews use tokens: Free gives 1,000 a month, with every feature included. Top-ups never expire."],
];
