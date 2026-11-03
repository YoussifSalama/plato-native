import Link from "next/link";
import { SIGNUP } from "@/components/links";
import { AlertsMock, ApplicationsMock, ApplyLogMock, AskMock, CareerMock, DashboardMock, PaletteMock, ProfileMock, ResultsMock, SearchMock, TokensMock, VoiceMock } from "@/components/mocks";
import { Beams, Closing, Faq, FAQ_HOME, Marquee, Plans, Rules } from "@/components/sections";
import { SCard, Stack } from "@/components/stack";

export default function Home() {
  return (
    <main>
      <header className="hero" id="top">
        <Beams />
        <div className="hero-center">
          <span className="badge"><b>New</b>The Chrome extension applies for you</span>
          <h1>Your job hunt, on <span className="grad">autopilot</span>.</h1>
          <p className="sub">Plato searches 32 job sources, ranks every posting against your profile, and applies in your own browser. It asks you only for what it cannot know.</p>
          <div className="cta"><a className="btn white lg" href={SIGNUP}>Get started</a><Link className="btn text lg" href="#story">See a run</Link></div>
          <div className="chips"><span className="chip"><i>✓</i>1,000 free tokens</span><span className="chip"><i>✓</i>No card</span><span className="chip"><i>✓</i>Applying costs nothing</span></div>
        </div>
        <div className="stats" aria-label="Plato in numbers"><span>Job sources</span><span className="num">32</span><span>Jobs per batch</span><span className="num">10</span><span>Submit presses</span><span className="num">1</span></div>
      </header>

      <Marquee />

      <section className="sec" id="story" style={{ paddingTop: 60 }}>
        <div className="wrap">
          <Stack head={<><span className="eyebrow">One run, start to finish</span><h2 className="h2" style={{ maxWidth: "18ch" }}>From your resume to &ldquo;Thanks for applying&rdquo;.</h2></>}>
            <SCard i={0} step="01 / Profile" title="Build your profile once." text="Upload a resume, or fill it in. Plato reads it, flags what's missing or inconsistent, and keeps your preferences: roles, locations, work rights, salary, notice period." tags={["Upload CV", "Missing info", "Preferences"]}><ProfileMock /></SCard>
            <SCard i={1} step="02 / Search" title="One search, every board." text="Tell Plato what you want. It runs the search across 32 sources, last 30 days only, and folds duplicates into one card. You can watch each stage." tags={["32 sources", "Live stages", "No duplicates"]}><SearchMock /></SCard>
            <SCard i={2} step="03 / Rank" title="Every posting, scored for you." text="Each job gets a match score against your profile, with the reasons: skills, level, location, remote. Excellent and strong matches rise to the top." tags={["NN% match", "Best match sort", "Salary signal"]}><ResultsMock /></SCard>
            <SCard i={3} step="04 / Apply" title="It applies in your browser. You watch." text="Pick up to ten and press Start. The extension uploads your resume, fills every field from your profile, and presses Submit once, in a tab you can see." tags={["Your tabs", "One Submit", "Page-confirmed"]}><ApplyLogMock /></SCard>
            <SCard i={4} step="05 / Ask" title="Questions, not guesswork." text="When a form needs something only you know, Plato stops and asks: Yes or No, a list, or your own words. Your answer is kept for every later form." tags={["Yes / No", "Choices", "Asked once"]}><AskMock /></SCard>
            <SCard i={5} step="06 / Track" title="Every application, accounted for." text="Applied, needs you, in progress, didn't go through. Each with what Plato sent, and the site's own words when it confirmed." tags={["Needs you", "What Plato sent", "Verify you're human"]}><ApplicationsMock /></SCard>
          </Stack>
        </div>
      </section>

      <section className="sec paper" id="tour">
        <div className="wrap">
          <div className="center"><span className="eyebrow">The whole product</span><h2 className="h2">Everything between the search and the interview.</h2><p className="lead">Plato is more than the extension. This is what lives in your account.</p></div>
          <div className="bento">
            <div className="tile w4"><h3>Your job hunt at a glance</h3><p>Searches, jobs ready, applications, postings analyzed. Match quality, where jobs come from, work setup and salary signal.</p><div className="ui"><DashboardMock /></div></div>
            <div className="tile w2 brand"><h3>Ranked, with reasons</h3><p>Excellent, strong, or not for you, and exactly why.</p>
              <ul className="reasons">{[["Skills", "9 of 11 required", "✓"], ["Level", "Senior, as you want", "✓"], ["Location", "Remote, Europe", "✓"], ["Salary", "Not published", "~"]].map(([k, v, m]) => <li key={k}><i>{m}</i><span>{k}</span><em>{v}</em></li>)}</ul>
              <div className="ui row" style={{ alignItems: "end" }}><div style={{ fontSize: 76, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1 }}>92<span style={{ fontSize: 30 }}>%</span></div><span className="pill" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>Excellent match</span></div></div>
            <div className="tile w3"><h3>Career studio</h3><p>Build a resume from your profile, tailor it to a posting&apos;s keywords, then practice for the call.</p><div className="ui"><CareerMock /></div></div>
            <div className="tile w3 dark"><h3>Voice interviews</h3><p>Talk to Plato out loud, like a real call. Feedback after every answer, then a scorecard.</p><div className="ui"><VoiceMock /></div></div>
            <div className="tile w3"><h3>Job alerts that never spam</h3><p>Roles you want and companies you follow. Daily, every three days or weekly. Never an empty digest.</p><div className="ui"><AlertsMock /></div></div>
            <div className="tile w3"><h3>Tokens you can see</h3><p>One balance for search, resumes and interviews. Applying is free. Top-ups never expire.</p><div className="ui"><TokensMock /></div></div>
            <div className="tile w6 two">
              <div><h3>Ask Plato anything, from anywhere</h3><p style={{ marginTop: 10 }}>Press <span className="kbd">⌘K</span> or <span className="kbd">Ctrl K</span> on any page. Jump to a page, start a search, or hand Plato a multi-step task in plain words.</p></div>
              <PaletteMock />
            </div>
          </div>
        </div>
      </section>

      <Rules />

      <section className="sec" id="pricing" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="center"><span className="eyebrow">Pricing</span><h2 className="h2">Tokens. Applying is free.</h2><p className="lead">Search, ranking, resumes and interviews use tokens. Every plan refills monthly. <Link href="/pricing/" style={{ textDecoration: "underline" }}>Full pricing</Link></p></div>
          <Plans />
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap"><span className="eyebrow">Questions</span><h2 className="h2">Straight answers.</h2><Faq items={FAQ_HOME} /></div>
      </section>

      <Closing />
    </main>
  );
}
