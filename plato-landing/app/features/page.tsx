import type { Metadata } from "next";
import { AlertsMock, ApplicationsMock, CareerMock, DashboardMock, PaletteMock, ProfileMock, ResultsMock, SearchMock, TokensMock, VoiceMock } from "@/components/mocks";
import { Closing, PageHero } from "@/components/sections";

export const metadata: Metadata = { title: "Features", description: "Search 32 sources, ranked matches, the Chrome extension, career studio, voice interviews, job alerts and the assistant." };

const F = ({ id, flip, eyebrow, title, text, items, mock }: { id: string; flip?: boolean; eyebrow: string; title: string; text: string; items: string[]; mock: React.ReactNode }) => (
  <div className={`feature${flip ? " flip" : ""}`} id={id}>
    <div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3><p>{text}</p><ul>{items.map((i) => <li key={i}>{i}</li>)}</ul></div>
    <div>{mock}</div>
  </div>
);

export default function Features() {
  return (
    <main>
      <PageHero eyebrow="Features" title={<>Everything your job hunt <span className="grad">needs</span>.</>} sub="Search, ranking, applying, resumes, interviews and alerts, in one account. Every screen below is the product as it runs.">
        <nav className="toc" aria-label="On this page">{[["#profile", "Profile"], ["#search", "Search"], ["#rank", "Ranking"], ["#track", "Applications"], ["#career", "Career"], ["#voice", "Interviews"], ["#alerts", "Alerts"], ["#assistant", "Assistant"], ["#tokens", "Tokens"]].map(([h, l]) => <a key={h} href={h}>{l}</a>)}</nav>
      </PageHero>

      <section className="sec paper" style={{ marginTop: 16 }}>
        <div className="wrap">
          <F id="profile" eyebrow="Onboarding" title="A profile Plato can actually use." text="Upload your CV, degrees and certificates. Plato reads them, then asks you to confirm what it found and flags anything missing or inconsistent." items={["Build profile, confirm information, preferences, ready", "Roles, locations, work rights, visa, salary, notice period", "Skills with proof: Learning, Working, Strong", "Projects and results with only real numbers"]} mock={<ProfileMock />} />
          <F id="search" flip eyebrow="Search" title="One query. 32 sources. Last 30 days." text="LinkedIn, Indeed, Google Jobs, Workable, Lever, Greenhouse, Ashby, Glassdoor, ZipRecruiter, Wellfound, Wuzzuf, Bayt and more. Watch Plato work through each stage." items={["Gathering info, analyzing jobs, checking requirements, applying", "Duplicates across boards folded into one card", "Where you live, where you want to work, how, and for how much"]} mock={<SearchMock />} />
          <F id="rank" eyebrow="Ranking" title="Scored against you, with the reasons." text="Every posting gets a match score: Excellent, Strong, or neither. Sort by best match, newest or highest salary; filter by location, source, job type, level, date and salary." items={["NN% match on every row", "Save, not interested, copy link", "Excel export of any result set", "A dashboard of match quality, sources, seniority and pay"]} mock={<ResultsMock rows={4} />} />
          <F id="dashboard" flip eyebrow="Dashboard" title="Your whole hunt, in numbers." text="Searches, jobs ready, applications and postings analyzed. Your pipeline from found to applied, match quality, work setup, top locations and the companies hiring most." items={["Your pipeline: jobs found, sent to Plato, applied", "Salary signal: Plato reads pay when postings publish it", "Recent runs and your searches"]} mock={<DashboardMock />} />
          <F id="track" eyebrow="Applications" title="Nothing lost between Submit and reply." text="Every application with its status and what Plato sent. The ones that need you sit on top." items={["All, needs you, in progress, applied, didn't go through", "Statuses: in apply queue, applying now, verify you're human, applied, posting closed", "Filter by platform and by search"]} mock={<ApplicationsMock />} />
        </div>
      </section>

      <section className="sec night">
        <div className="wrap">
          <F id="career" flip eyebrow="Career studio" title="A resume for the posting in front of you." text="Build a resume from your profile, ready as a PDF. Paste a posting and get one that matches its keywords, without adding anything untrue. Approve a version and every application uses it." items={["Classic and Modern templates", "Keyword match for this job", "Improve my resume, line by line"]} mock={<CareerMock />} />
          <F id="voice" eyebrow="Interviews" title="Practice the call before the call." text="Text mock interviews on the job you applied to, or a voice interview that feels like a real call. Choose feedback after every answer and harder and harder questions, then get a scorecard." items={["Practice, prove a skill, improve my answers", "Scores over time, strengths and next steps", "Prove a skill: earn it on your CV"]} mock={<VoiceMock />} />
        </div>
      </section>

      <section className="sec paper">
        <div className="wrap">
          <F id="alerts" eyebrow="Job alerts" title="New openings, never noise." text="Alerts for the roles you want and for every opening at the companies you follow. Pick the rhythm; Plato never sends an empty digest." items={["Daily, every 3 days, or weekly", "In Plato or by email", "Pause or stop any alert"]} mock={<AlertsMock />} />
          <F id="assistant" flip eyebrow="Assistant" title="Ask Plato, from any page." text="Plato's assistant sits on every page. Press ⌘K or Ctrl K to jump anywhere, start a search, or give it a task in plain words." items={["Find remote jobs, show my saved jobs, take me to my profile", "Go to, actions, and Ask Plato in one palette", "Multi-step tasks, done in front of you"]} mock={<PaletteMock />} />
          <F id="tokens" eyebrow="Tokens" title="One balance, always on screen." text="Searches, resumes, interviews and written answers use tokens. Every plan refills monthly; top-ups never expire. Applying through the extension costs nothing." items={["Where your tokens went, by feature", "Estimates before you spend", "Running out breaks nothing"]} mock={<TokensMock />} />
        </div>
      </section>

      <Closing title="See it work on your own profile." />
    </main>
  );
}
