import Link from "next/link";
import type { ReactNode } from "react";
import { PACKS, PLANS, SIGNUP, SOURCES } from "./links";

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
      <div className="lbl">One search across 32 job sources</div>
      <div className="track">
        {row.map(([n, c], i) => <span className="src" key={i}><i style={{ background: c }}>{n[0]}</i>{n}</span>)}
      </div>
    </div>
  );
}

export const RULES: [string, string][] = [
  ["Apply where you didn't choose", "Only the jobs you picked, up to ten per batch."],
  ["Press Submit twice", "The gate lives in the executor's code, not in a prompt. One press per application."],
  ["Solve a captcha", "A human check is yours to solve. Plato waits and tells you which tab."],
  ["Invent an answer", "A fact your profile lacks becomes a question to you, asked once."],
  ["Claim success without proof", "An application counts as sent only when the site's own confirmation is on screen."],
  ["Talk to anyone else", "The extension talks to one origin, api.platohiring.com. No analytics, no third-party code."],
];

export function Rules({ title = "What Plato will never do, whatever a page says." }: { title?: string }) {
  return (
    <section className="sec">
      <div className="wrap">
        <span className="eyebrow">Rules in code</span>
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
            <span className="name">{p.name}{p.hi && <em>Most popular</em>}</span>
            <div className="price num">${p.price}<small> / month</small></div>
            <div className="tok num">{p.tokens} tokens every month</div>
            <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            <a className={`btn ${p.hi ? "white" : "ghost-dark"}`} href={SIGNUP}>{p.cta}</a>
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

export function Closing({ title = "Build the profile once. Let it apply." }: { title?: string }) {
  return (
    <section className="sec">
      <div className="closing">
        <Beams n={2} />
        <span className="eyebrow">Start today</span>
        <h2 className="h2">{title}</h2>
        <p className="lead" style={{ marginInline: "auto" }}>1,000 free tokens every month. No card. Applying through the extension costs nothing.</p>
        <div className="cta"><a className="btn white lg" href={SIGNUP}>Create your profile</a><Link className="btn text" href="/how-it-works/">See how it works</Link></div>
      </div>
    </section>
  );
}

export const FAQ_HOME: [string, string][] = [
  ["Does Plato apply without me?", "Only to the jobs you picked, only from your profile. It presses Submit once per application and stops the moment a form needs a fact you haven't given, a captcha, or a sign-in."],
  ["Which sites can it apply on?", "The extension fills forms on Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Recruitee, Teamtailor, Personio, JazzHR, LinkedIn, Indeed and Wuzzuf. Search covers 32 sources."],
  ["What does it cost?", "Free gives 1,000 tokens a month for searching, ranking, resumes and interviews. Applying through the extension costs no tokens at all. Pro is $19 and Max $59 a month."],
  ["Where does my data go?", "Your profile goes to the AI providers that rank jobs and write answers, and to the employers you apply to. Nothing is sold, no ads, no tracking. The privacy policy lists every destination."],
  ["Can I watch what it does?", "Yes. Each application runs in a tab grouped under \"Plato\", and every run keeps a journal: each field, each question, the page's own confirmation."],
];
