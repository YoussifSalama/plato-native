import type { Metadata } from "next"
import "./landing.css"
import { CONTACT, LOGIN, PRIVACY, SEARCH, SECURITY, SIGNUP, TERMS } from "./_lp/links"
import { AlertsMock, ApplicationsMock, ApplyLogMock, AskMock, CareerMock, PaletteMock, ProfileMock, ResultsMock, SearchMock, TokensMock, VoiceMock } from "./_lp/mocks"
import { Beams, Closing, Faq, FAQ_HOME, Marquee, Plans, Rules } from "./_lp/sections"
import { SCard, Stack } from "./_lp/stack"
import { Logo, Nav } from "./_lp/nav"
import { Motion } from "./_lp/motion"

// The job-seeker landing: what signed-out visitors see at jobs.platohiring.com/ (proxy.ts rewrites / here when there
// is no session). One page, two ways in: try a first search from the CV (the main road, every section leads back to
// it) or log in. Moved from plato-landing's home, which becomes the company site.
export const metadata: Metadata = {
  title: "Plato Job Seeker · Upload your CV, see the jobs that fit you",
  description: "Upload your CV. Plato searches the job boards for your roles, ranks every posting against your CV and applies from your own browser. Applying costs nothing; your first search needs no account.",
}

export default function Welcome() {
  return (
    <div className="lp">
      <Motion />
      <Nav />
      <main>
        <header className="hero" id="top">
          <Beams />
          <div className="hero-center">
            <span className="badge">
              <b>Free</b>First search, no account
            </span>
            <h1>
              Upload your CV. <span className="grad">See the jobs that fit you.</span>
            </h1>
            <p className="sub">Plato searches the job boards for your roles, ranks every posting against your CV, and applies for you from your own browser. Applying costs nothing.</p>
            <div className="cta">
              <a className="btn white lg" href={SEARCH}>
                Find jobs from your CV
              </a>
              <a className="btn ghost-dark lg" href={LOGIN}>
                Log in
              </a>
            </div>
            <p className="sub" style={{ marginTop: 18, fontSize: 13.5 }}>
              Your first search runs on LinkedIn, free. Sign up and your CV and results come with you.
            </p>
          </div>
          <div className="stats" aria-label="Plato in numbers">
            <span>Postings from the last</span>
            <span className="num">30 days</span>
            <span>Jobs per batch, up to</span>
            <span className="num">10</span>
            <span>Submit presses per job</span>
            <span className="num">1</span>
            <span>Cost to apply</span>
            <span className="num">$0</span>
          </div>
        </header>

        <Marquee />

        <section className="sec" id="try" style={{ paddingTop: 60, paddingBottom: 0 }}>
          <div className="wrap">
            <div className="center">
              <span className="eyebrow">Try it now</span>
              <h2 className="h2">Your first search takes a minute and no account.</h2>
            </div>
            <div className="steps4 three">
              {[
                ["1", "Upload your CV", "PDF or DOCX. Plato reads your roles, skills and experience."],
                ["2", "Plato searches LinkedIn", "For the roles in your CV, postings from the last 30 days, ranked against you."],
                ["3", "See your best matches", "Your two best matches are free. Sign up to see every job and apply."],
              ].map(([n, t, d]) => (
                <div key={n}>
                  <span className="n num">{n}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </div>
            <div className="center" style={{ marginTop: 32 }}>
              <div className="cta">
                <a className="btn white lg" href={SEARCH}>
                  Find jobs from your CV
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="story" style={{ paddingTop: 60 }}>
          <div className="wrap">
            <Stack
              head={
                <>
                  <span className="eyebrow">How it works, with an account</span>
                  <h2 className="h2" style={{ maxWidth: "18ch" }}>
                    From your CV to the site&apos;s own &ldquo;Thanks for applying&rdquo;.
                  </h2>
                </>
              }
            >
              <SCard i={0} step="01 / Your CV" title="Your profile, from your CV." text="Plato reads your CV once: roles, skills, experience, work rights. It asks only for what's missing, and keeps your preferences for every search." tags={["Upload CV", "Only what's missing", "Preferences"]}>
                <ProfileMock />
              </SCard>
              <SCard i={1} step="02 / Search" title="One search, many boards." text="LinkedIn, Indeed, Google Jobs, Wuzzuf, Bayt and more, depending on your country. Only the last 30 days, with duplicates merged into one card. You watch each stage." tags={["Your country's boards", "Last 30 days", "No duplicates"]}>
                <SearchMock />
              </SCard>
              <SCard i={2} step="03 / Rank" title="Ranked against your CV." text="Every posting gets a match score and the skills and roles it matched. Excellent and Strong matches come first." tags={["Match score", "What matched", "Best first"]}>
                <ResultsMock />
              </SCard>
              <SCard i={3} step="04 / Apply" title="It applies in your browser." text="Pick up to ten and press Start. Each job opens in a tab you can see; Plato fills the form from your profile and presses Submit once. If the site needs an account, it can create one." tags={["Your tabs", "One Submit", "Up to 10 at once"]}>
                <ApplyLogMock />
              </SCard>
              <SCard i={4} step="05 / Ask" title="It asks, it doesn't guess." text="A question your profile can't answer comes to you: Yes or No, a choice, or your own words. Your answer is saved for the next form." tags={["Yes / No", "Choices", "Saved answers"]}>
                <AskMock />
              </SCard>
              <SCard i={5} step="06 / Track" title="Sent means confirmed." text="An application counts as sent only when the site's own confirmation is on the page, or when you confirm it. Every one shows what Plato filled in." tags={["Site-confirmed", "Needs you", "What Plato sent"]}>
                <ApplicationsMock />
              </SCard>
            </Stack>
            <div className="center" style={{ marginTop: 48 }}>
              <div className="cta">
                <a className="btn white lg" href={SEARCH}>
                  Start with your CV
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="sec paper" id="inside">
          <div className="wrap">
            <div className="center">
              <span className="eyebrow">Inside your account</span>
              <h2 className="h2">Everything between the search and the interview.</h2>
              <p className="lead">Your matches, your applications, interview practice and job alerts, in one place.</p>
            </div>
            <div className="bento">
              <div className="tile w3">
                <h3>Career: a CV for each job</h3>
                <p>Build your CV from your profile as a PDF, tailor it to a posting&apos;s keywords, and practise with hiring quizzes.</p>
                <div className="ui">
                  <CareerMock />
                </div>
              </div>
              <div className="tile w3 dark">
                <h3>Interview practice, out loud</h3>
                <p>A practice call with feedback after every answer, or a mock interview with a scorecard at the end. In writing too.</p>
                <div className="ui">
                  <VoiceMock />
                </div>
              </div>
              <div className="tile w3">
                <h3>Job alerts that never spam</h3>
                <p>Roles you want and companies you follow. Daily, every three days or weekly. No empty emails.</p>
                <div className="ui">
                  <AlertsMock />
                </div>
              </div>
              <div className="tile w3">
                <h3>Tokens you can see</h3>
                <p>One balance for search, CVs and interviews, and where each token went. Applying costs none.</p>
                <div className="ui">
                  <TokensMock />
                </div>
              </div>
              <div className="tile w6 two">
                <div>
                  <h3>Ask Plato from any page</h3>
                  <p style={{ marginTop: 10 }}>
                    Press <span className="kbd">⌘K</span> or <span className="kbd">Ctrl K</span>. Jump to a page, start a search, or ask Plato to do something in plain words.
                  </p>
                </div>
                <PaletteMock />
              </div>
            </div>
          </div>
        </section>

        <Rules />

        <section className="sec" id="pricing" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="center">
              <span className="eyebrow">Pricing</span>
              <h2 className="h2">Applying is free.</h2>
              <p className="lead">Searching, ranking, CVs and interviews use tokens; plans refill every month. Every feature is on every plan, and top-ups never expire. Your first search needs no account at all.</p>
            </div>
            <Plans />
          </div>
        </section>

        <section className="sec" id="faq" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <span className="eyebrow">Questions</span>
            <h2 className="h2">Straight answers.</h2>
            <Faq items={FAQ_HOME} />
          </div>
        </section>

        <Closing />
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <a className="brand" href="#top">
                <Logo />
                Plato Job Seeker
              </a>
              <p>The AI job hunter that searches, ranks and applies, in the open. You step in only when it needs you.</p>
            </div>
            <div>
              <h4>Product</h4>
              <a href="#story">How it works</a>
              <a href="#inside">Inside</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div>
              <h4>Trust</h4>
              <a href={SECURITY}>Rules and data</a>
              <a href={PRIVACY}>Privacy policy</a>
              <a href={TERMS}>Terms of service</a>
            </div>
            <div>
              <h4>Start</h4>
              <a href={SEARCH}>Find jobs from your CV</a>
              <a href={SIGNUP}>Create account</a>
              <a href={LOGIN}>Log in</a>
              <span style={{ display: "block", padding: "4px 0" }}>{CONTACT}</span>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Plato Job Seeker · jobs.platohiring.com</span>
            <span>Made for job seekers who&apos;d rather interview than fill forms.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
