import type { Metadata } from "next";
import { AskMock, ProfileMock, ResultsMock, SearchMock, ApplyLogMock } from "@/components/mocks";
import { Closing, PageHero } from "@/components/sections";

export const metadata: Metadata = { title: "How it works", description: "From your resume to the site's own confirmation: how Plato searches, ranks and applies." };

const STEPS = [
  ["Build your profile", "Upload your CV or fill it in. Plato reads it, flags what's missing, and keeps your preferences."],
  ["Search and rank", "One query across 32 sources. Every posting scored against your profile, with reasons."],
  ["Pick up to ten", "Press Start. The extension opens each application in your browser and fills it."],
  ["Answer what's missing", "Unknown facts and human checks come to you. Everything else, Plato does."],
];

export default function How() {
  return (
    <main>
      <PageHero eyebrow="How it works" title={<>You own the first step <span className="grad">and the last</span>.</>} sub="Plato does the slow part in the middle: searching, reading, scoring and filling forms. Your profile is the only source of truth." />
      <section className="sec">
        <div className="wrap">
          <div className="steps4">{STEPS.map(([t, d], i) => <div key={t}><span className="n">{i + 1}</span><h3>{t}</h3><p>{d}</p></div>)}</div>
        </div>
      </section>
      <section className="sec paper">
        <div className="wrap">
          {[
            ["01", "Your profile is the source", "Everything Plato writes or fills comes from it: experience, education, skills with proof, projects with real numbers, preferences. Plato asks you to confirm what it read.", <ProfileMock key="p" />],
            ["02", "The search runs everywhere at once", "Tell Plato what you want in plain words, or answer the short question card: where you live, where you want to work, how, visa, employment type, minimum salary.", <SearchMock key="s" />],
            ["03", "Ranking explains itself", "Every result carries a match score and a label. Open any job to see why: what matched, what's missing, and whether it publishes pay.", <ResultsMock key="r" />],
            ["04", "Applying happens in your browser", "The extension reads the form, uploads your resume, fills each field and presses Submit once. The journal shows every step.", <ApplyLogMock key="a" />],
            ["05", "You answer only what's missing", "A question your profile can't answer becomes a short form in the panel. Your answer is remembered for every later application.", <AskMock key="q" />],
          ].map(([n, t, d, m], i) => (
            <div className={`feature${i % 2 ? " flip" : ""}`} key={String(n)}><div><span className="eyebrow">{n}</span><h3>{t}</h3><p>{d}</p></div><div>{m}</div></div>
          ))}
        </div>
      </section>
      <Closing />
    </main>
  );
}
