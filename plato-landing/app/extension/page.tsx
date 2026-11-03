import type { Metadata } from "next";
import { ApplicationsMock, ApplyLogMock, AskMock, PairMock } from "@/components/mocks";
import { Closing, Faq, PageHero, Rules } from "@/components/sections";
import { SCard, Stack } from "@/components/stack";
import { PRIVACY, SIGNUP } from "@/components/links";

export const metadata: Metadata = { title: "Chrome extension", description: "Plato Apply fills and submits the job applications you picked, in your own browser, and asks you only when it needs you." };

const SITES = ["Greenhouse", "Lever", "Ashby", "Workable", "SmartRecruiters", "BambooHR", "Recruitee", "Teamtailor", "Personio", "JazzHR", "LinkedIn", "Indeed", "Wuzzuf"];
const PERMS: [string, string][] = [
  ["Side panel", "The extension's whole interface: your jobs, the batch progress, the questions it asks."],
  ["Storage", "The pairing token for your account and the state of the current batch. No browsing data."],
  ["Tab groups", "Groups the tabs it opens under \"Plato\" so you see what it is working on."],
  ["Debugger", "Used only on the application tab during a run, to click and type the way you would. Detached when the run ends. Never reads other tabs, console or network."],
];

export default function Extension() {
  return (
    <main>
      <PageHero eyebrow="Plato Apply for Chrome" title={<>Pick ten jobs. <span className="grad">Watch them apply</span>.</>} sub="The extension opens each application in your browser, uploads your resume, fills every field from your profile and presses Submit once. It stops for you when a form needs a fact, a captcha or a sign-in.">
        <div className="cta"><a className="btn white lg" href={SIGNUP}>Create your profile</a><a className="btn text lg" href={PRIVACY}>What it reads, and why</a></div>
      </PageHero>

      <section className="sec">
        <div className="wrap">
          <Stack head={<><span className="eyebrow">How a batch runs</span><h2 className="h2" style={{ maxWidth: "16ch" }}>Four moments, start to confirmation.</h2></>}>
            <SCard i={0} step="01 / Link" title="Link the extension to your account." text="On the website, open Extension and copy the code. Type it in the side panel. The code works once and expires in two minutes." tags={["One-time code", "Two minutes", "Linked browsers"]}><PairMock /></SCard>
            <SCard i={1} step="02 / Fill" title="It fills the form, in a tab you can watch." text="Resume first, then every field your profile answers. Type-ahead lists are picked, not typed over. Nothing invented." tags={["Resume upload", "Every field", "Your pace"]}><ApplyLogMock /></SCard>
            <SCard i={2} step="03 / Ask" title="It asks what only you know." text="Relocation, work authorization, salary: if it isn't in your profile, the panel shows a short form. Your answer goes into this form and every later one." tags={["Yes / No", "A list", "Your words"]}><AskMock /></SCard>
            <SCard i={3} step="04 / Confirm" title="One Submit. The page says the rest." text="An application counts only when the site's own confirmation is on screen. A refusal or a human check stops the run and tells you exactly what happened." tags={["Page-confirmed", "Never twice", "Needs you"]}><ApplicationsMock /></SCard>
          </Stack>
        </div>
      </section>

      <section className="sec paper">
        <div className="wrap">
          <div className="center"><span className="eyebrow">Where it applies</span><h2 className="h2">Thirteen application systems, one engine.</h2><p className="lead">No per-site scripts: the same engine reads any of these forms the way a person does.</p></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 40 }}>{SITES.map((s) => <span key={s} className="opt" style={{ fontSize: 15, padding: "10px 18px" }}>{s}</span>)}</div>
          <div className="bento" style={{ marginTop: 64 }}>
            {PERMS.map(([t, d]) => <div className="tile w3" key={t}><span className="eyebrow">Permission</span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      <Rules title="Rules the extension cannot be talked out of." />

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap"><span className="eyebrow">Questions</span><h2 className="h2">About the extension.</h2>
          <Faq items={[
            ["Do I need to keep the tab open?", "Yes, Plato works in your browser. Keep Chrome open while a batch runs; you can use other tabs meanwhile."],
            ["What happens at a captcha?", "The run stops on that job and the panel says so. Solve it in the tab, press \"I solved it, continue\", and Plato carries on."],
            ["Can it apply twice by mistake?", "No. Submit is pressed at most once per application, enforced in code. If the page doesn't confirm, the job goes to \"Please check\" and waits for you."],
            ["How many jobs at once?", "Up to ten per batch. One batch at a time."],
          ]} />
        </div>
      </section>
      <Closing title="Install it. Pick ten. Watch them go." />
    </main>
  );
}
