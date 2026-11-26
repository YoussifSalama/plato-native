import type { ReactNode } from "react";
import { APP } from "./links";

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

// The closing call: the job-seeker product lives on jobs.platohiring.com now.
export function Closing({ title = "Looking for a job? Plato does the searching." }: { title?: string }) {
  return (
    <section className="sec">
      <div className="closing">
        <Beams n={2} />
        <span className="eyebrow">For job seekers</span>
        <h2 className="h2">{title}</h2>
        <p className="lead" style={{ marginInline: "auto" }}>Upload your CV and see the jobs that fit you in about a minute. No account needed to try.</p>
        <div className="cta"><a className="btn white lg" href={APP}>Find a job with Plato</a></div>
      </div>
    </section>
  );
}
