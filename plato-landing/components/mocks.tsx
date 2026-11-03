// Product screens rebuilt in HTML from the real web app (plato-job-seeker-native-fe): the same labels, statuses,
// tabs and widgets the seeker sees. Sample people and companies only.
import { SOURCES } from "./links";

function Win({ url, dark, children }: { url: string; dark?: boolean; children: React.ReactNode }) {
  return (
    <div className={`win${dark ? " dark" : ""}`}>
      <div className="bar"><i /><i /><i /><span>{url}</span></div>
      <div className="body">{children}</div>
    </div>
  );
}

const JOBS = [
  { a: "N", c: "#005ba7", t: "Frontend Engineer", m: "Northwind · Lever · Remote, Europe", p: 92, l: "Excellent match" },
  { a: "C", c: "#1c9a4b", t: "Full Stack Developer", m: "Contoso · Greenhouse · Cairo", p: 88, l: "Excellent match" },
  { a: "F", c: "#0d9488", t: "Product Engineer", m: "Fabrikam · LinkedIn · Berlin, hybrid", p: 76, l: "Strong match" },
  { a: "L", c: "#d97706", t: "React Developer", m: "Litware · Workable · Dubai", p: 71, l: "Strong match" },
];

export function ProfileMock() {
  return (
    <Win url="jobs.platohiring.com/onboarding">
      <div className="row"><b style={{ fontSize: 15 }}>Build your profile</b><span className="muted">Step 1 of 4</span></div>
      <div className="stepper mt"><span className="on" /><span /><span /><span /></div>
      <div className="mt2" style={{ border: "2px dashed var(--brand-line)", borderRadius: 14, padding: 18, textAlign: "center", background: "var(--brand-tint)" }}>
        <b style={{ color: "var(--brand)" }}>Resume_Youssif.pdf</b><div className="muted">Uploaded · read in 6 s</div>
      </div>
      <div className="mt"><div className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--divider)", fontSize: 13.5 }}>Experience<span className="pill g">5 roles found</span></div>
        <div className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--divider)", fontSize: 13.5 }}>Education<span className="pill g">2 degrees</span></div>
        <div className="row" style={{ padding: "8px 0", fontSize: 13.5 }}>Notice period<span className="pill a">Missing info</span></div></div>
    </Win>
  );
}

export function SearchMock() {
  return (
    <Win url="jobs.platohiring.com/jobs">
      <div className="row"><b style={{ fontSize: 15 }}>&ldquo;Frontend engineer, remote or Cairo&rdquo;</b><span className="pill v">Running</span></div>
      <div className="stepper mt"><span className="done" /><span className="on" /><span /><span /></div>
      <div className="row muted mt" style={{ fontSize: 11.5 }}><span>Gathering info</span><span>Analyzing jobs</span><span>Checking requirements</span><span>Applying</span></div>
      <div className="mt2" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SOURCES.slice(0, 9).map(([n, c]) => <span key={n} className="pill n" style={{ color: c }}>{n}</span>)}
      </div>
      <div className="mt2 muted">38 postings from 11 sources · last 30 days only</div>
    </Win>
  );
}

export function ResultsMock({ rows = 4 }: { rows?: number }) {
  return (
    <Win url="jobs.platohiring.com/jobs/frontend-remote">
      <div className="tabs"><span className="on">Discover<em>38</em></span><span>Saved<em>4</em></span><span>Applied<em>6</em></span><span>Recommended for you</span></div>
      <div className="mt2">
        {JOBS.slice(0, rows).map((j) => (
          <div className="jobrow" key={j.t}>
            <span className="av" style={{ background: j.c }}>{j.a}</span>
            <div><b>{j.t}</b><small>{j.m}</small></div>
            <div style={{ textAlign: "right" }}><span className={`match${j.p < 80 ? " mid" : ""}`}>{j.p}% match</span><small style={{ display: "block", marginTop: 4, color: "var(--ink-3)", fontSize: 11.5 }}>{j.l}</small></div>
          </div>
        ))}
      </div>
    </Win>
  );
}

const LOG: [string, string, string, string, string?][] = [
  ["+0.0s", "read_page", "k", "14 fields, resume upload, Submit"],
  ["+0.4s", "file_upload", "k", "Resume.pdf", "uploaded"],
  ["+2.1s", "form_input", "k", "Name, Email, Phone, LinkedIn", "set"],
  ["+4.8s", "form_input", "k", "Location: Cairo, Egypt", "picked"],
  ["+6.9s", "ASK", "w", "Willing to relocate to Berlin?"],
  ["+41s ", "answer", "k", "No, kept for next time"],
  ["+44s ", "left_click", "k", "Submit application", "(once)"],
  ["+47s ", "CONFIRMED", "ok", "\"Thanks for applying.\""],
];

export function ApplyLogMock() {
  return (
    <Win url="plato apply · Frontend Engineer · Northwind" dark>
      <pre className="log">
        {LOG.map(([t, k, cls, rest, okText], i) => (
          <span key={i}>
            <span className="t">{t}</span> <span className={cls}>{k.padEnd(14)}</span> {rest}{okText ? <> <span className="ok">{okText}</span></> : null}{"\n"}
          </span>
        ))}
      </pre>
    </Win>
  );
}

export function AskMock() {
  return (
    <div className="win" style={{ maxWidth: 460, marginInline: "auto" }}>
      <div className="body">
        <div className="row"><b style={{ display: "flex", alignItems: "center", gap: 8 }}><img src="/logo.png" alt="" width={22} height={22} />Plato Apply</b><span className="pill a">Needs you</span></div>
        <div className="mt2" style={{ border: "2px solid var(--brand-line)", borderRadius: 16, padding: 16 }}>
          <div className="row muted"><span>Question 1 of 2</span><span className="stepper" style={{ width: 60 }}><span className="on" /><span /></span></div>
          <b style={{ display: "block", marginTop: 8 }}>Are you willing to relocate to Berlin?</b>
          <div className="why">The form requires &ldquo;Willing to relocate?&rdquo; and your profile does not say. Plato will not guess.</div>
          <div className="opts"><span className="opt">Yes</span><span className="opt on">No</span><span className="opt">Something else</span></div>
          <div className="row mt2"><span className="muted">Kept for every later form</span><span className="btn brand sm" style={{ height: 34 }}>Next</span></div>
        </div>
      </div>
    </div>
  );
}

export function ApplicationsMock() {
  const rows = [
    ["Frontend Engineer", "Northwind", "Applied", "g"], ["Product Engineer", "Fabrikam", "Needs you", "a"], ["React Developer", "Litware", "Applying now", "v"],
    ["Data Analyst", "Adatum", "Verify you're human", "a"], ["Backend Engineer", "Tailspin", "Posting closed", "n"],
  ];
  return (
    <Win url="jobs.platohiring.com/applications">
      <div className="tabs"><span className="on">All<em>24</em></span><span>Needs you<em>2</em></span><span>In progress<em>3</em></span><span>Applied<em>17</em></span><span>Didn&apos;t go through</span></div>
      <div className="mt2">
        {rows.map(([t, c, s, k]) => (
          <div key={t} className="row" style={{ padding: "11px 4px", borderBottom: "1px solid var(--divider)", fontSize: 14 }}>
            <span><b>{t}</b> <span className="muted">· {c}</span></span><span className={`pill ${k}`}>{s}</span>
          </div>
        ))}
      </div>
    </Win>
  );
}

export function DashboardMock() {
  return (
    <Win url="jobs.platohiring.com/jobs">
      <div className="kpis">
        {[["Searches", "6"], ["Jobs ready", "38"], ["Applications", "24"], ["Analyzed", "1,412"]].map(([l, v]) => (
          <div key={l} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10 }}><div className="muted" style={{ fontSize: 11 }}>{l}</div><b className="num" style={{ fontSize: 20 }}>{v}</b></div>
        ))}
      </div>
      <div className="mt2 ringrow">
        <div className="ring" style={{ ["--p" as string]: 72 } as React.CSSProperties}><div><span className="num">72%</span><small>strong+</small></div></div>
        <div className="bars">
          <b style={{ fontSize: 13 }}>Where jobs come from</b>
          {[["LinkedIn", 38], ["Greenhouse", 24], ["Lever", 18], ["Workable", 12]].map(([n, w]) => <div key={n}><span>{n}</span><i style={{ ["--w" as string]: `${Number(w) * 2.4}%` } as React.CSSProperties} /><span className="num">{w}</span></div>)}
        </div>
      </div>
    </Win>
  );
}

export function CareerMock() {
  return (
    <Win url="jobs.platohiring.com/career">
      <b>Plato Career</b>
      <div className="mt" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[["Build my resume", "From your profile, ready as a PDF"], ["Tailor to a job", "Match a posting's keywords"], ["Mock interview", "Text, on your posting"], ["Voice interview", "Talk out loud, like a real call"]].map(([t, d]) => (
          <div key={t} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--brand-tint)" }}><b style={{ fontSize: 13.5 }}>{t}</b><div className="muted" style={{ marginTop: 2 }}>{d}</div></div>
        ))}
      </div>
      <div className="mt2" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
        <div className="row"><b style={{ fontSize: 13.5 }}>Keyword match for this job</b><span className="match">86%</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{["React", "TypeScript", "Next.js", "Testing"].map((k) => <span key={k} className="pill g">{k}</span>)}<span className="pill a">GraphQL</span></div>
      </div>
    </Win>
  );
}

export function VoiceMock() {
  return (
    <Win url="jobs.platohiring.com/career/interviews" dark>
      <div className="row"><b>Voice interview · Practice</b><span className="pill v" style={{ background: "rgba(63,180,238,.15)", color: "var(--glow-2)" }}>Live</span></div>
      <div style={{ display: "flex", gap: 4, alignItems: "end", height: 56, marginTop: 18 }}>
        {[18, 30, 44, 26, 52, 38, 22, 46, 30, 16, 40, 54, 28, 20, 36, 48, 24].map((h, i) => <span key={i} style={{ flex: 1, height: h, borderRadius: 4, background: "linear-gradient(180deg, var(--glow-2), var(--brand))" }} />)}
      </div>
      <p style={{ marginTop: 16, font: "400 13.5px/1.7 var(--mono)", color: "var(--night-ink-2)" }}>&ldquo;Tell me about a performance problem you fixed in a React app.&rdquo;</p>
      <div className="row mt2" style={{ fontSize: 13, color: "var(--night-ink-3)" }}><span>Feedback after every answer · Harder and harder questions</span><span className="btn white sm" style={{ height: 32 }}>Get my scorecard</span></div>
    </Win>
  );
}

export function AlertsMock() {
  return (
    <Win url="jobs.platohiring.com/insights">
      <div className="tabs"><span className="on">Roles you want</span><span>Companies you follow</span></div>
      <div className="mt2">
        {[["Frontend engineer · Remote", "Daily", "3 new"], ["React developer · Cairo", "Every 3 days", "1 new"], ["Every opening at Northwind", "Weekly", "Paused"]].map(([t, c, s]) => (
          <div key={t} className="row" style={{ padding: "11px 4px", borderBottom: "1px solid var(--divider)", fontSize: 13.5 }}><span><b>{t}</b><span className="muted" style={{ display: "block" }}>{c} · in Plato or by email</span></span><span className={`pill ${s === "Paused" ? "n" : "v"}`}>{s}</span></div>
        ))}
      </div>
      <div className="muted mt">Plato never sends an empty digest.</div>
    </Win>
  );
}

export function TokensMock() {
  return (
    <Win url="jobs.platohiring.com/tokens">
      <div className="row"><div><div className="muted">Balance</div><b className="num" style={{ fontSize: 30, letterSpacing: "-0.03em" }}>6,240</b><span className="muted"> tokens</span></div><span className="pill v">Pro · refills monthly</span></div>
      <div className="mt2"><b style={{ fontSize: 13 }}>Where your tokens went</b>
        <div className="bars mt">{[["Searches", 46], ["Resumes", 22], ["Interviews", 18], ["Answers", 14]].map(([n, w]) => <div key={n}><span>{n}</span><i style={{ ["--w" as string]: `${Number(w) * 2}%` } as React.CSSProperties} /><span className="num">{w}%</span></div>)}</div>
      </div>
      <div className="muted mt">Applying through the extension costs no tokens.</div>
    </Win>
  );
}

export function PaletteMock() {
  return (
    <div className="win" style={{ maxWidth: 520, marginInline: "auto" }}>
      <div className="body">
        <div className="row" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}><span className="muted" style={{ fontSize: 14 }}>Go to a page, start something, or ask Plato…</span><span className="kbd">⌘K</span></div>
        <div className="muted mt" style={{ fontSize: 11.5, textTransform: "uppercase", fontWeight: 700 }}>Go to</div>
        {["Applications", "Career", "Job alerts"].map((t) => <div key={t} style={{ padding: "8px 10px", fontSize: 14, borderRadius: 8 }}>{t}</div>)}
        <div className="muted" style={{ fontSize: 11.5, textTransform: "uppercase", fontWeight: 700, marginTop: 6 }}>Actions</div>
        <div style={{ padding: "8px 10px", fontSize: 14, borderRadius: 8, background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 600 }}>Ask Plato: find remote React jobs in Europe</div>
        <div style={{ padding: "8px 10px", fontSize: 14 }}>Start a mock interview</div>
      </div>
    </div>
  );
}

export function PairMock() {
  return (
    <Win url="jobs.platohiring.com/extension">
      <b>Link your browser</b>
      <div className="muted" style={{ marginTop: 2 }}>Type this code in the Chrome extension&apos;s side panel.</div>
      <div className="mt2" style={{ display: "flex", gap: 8 }}>{"K7QM-4XPA".split("").map((ch, i) => <span key={i} style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 10, border: ch === "-" ? "0" : "1px solid var(--line)", background: ch === "-" ? "transparent" : "var(--brand-tint)", fontFamily: "var(--mono)", fontWeight: 600, fontSize: 18 }}>{ch}</span>)}</div>
      <div className="muted mt">The code works once and expires in two minutes.</div>
      <div className="mt2"><b style={{ fontSize: 13 }}>Linked browsers</b><div className="row" style={{ padding: "10px 0", fontSize: 13.5 }}>Chrome on Linux<span className="pill g">Active</span></div></div>
    </Win>
  );
}
