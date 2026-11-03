import type { Metadata } from "next";
import { Closing, PageHero, Rules } from "@/components/sections";
import { CONTACT, PRIVACY, TERMS } from "@/components/links";

export const metadata: Metadata = { title: "Rules and data", description: "What Plato stores, where it sends it, and the rules the extension enforces in code." };

const DATA: [string, string][] = [
  ["Your account", "Name, email and a hashed password. The password itself is never stored."],
  ["Your profile", "What you enter or upload for applications. Resume files in private storage, served only to you."],
  ["AI providers", "Your profile and the job text go to OpenAI and Anthropic to rank jobs and write answers. Not used to train their models under our terms."],
  ["Employers", "When you apply, what you submit goes to that employer's form, as if you sent it yourself."],
  ["No one else", "No ads, no tracking cookies, no data sold. One session cookie keeps you signed in."],
  ["Deleting", `Email ${CONTACT} from your account address and the account, profile, files and history are deleted.`],
];

export default function Security() {
  return (
    <main>
      <PageHero eyebrow="Rules and data" title={<>Built like a <span className="grad">careful person</span>.</>} sub="Plato applies in your name, so it behaves the way you would: only where you chose, once, and never with an invented answer." />
      <Rules />
      <section className="sec paper">
        <div className="wrap">
          <div className="center"><span className="eyebrow">Your data</span><h2 className="h2">What we store, and where it goes.</h2></div>
          <div className="bento">{DATA.map(([t, d]) => <div className="tile w2" key={t}><h3>{t}</h3><p>{d}</p></div>)}</div>
          <p className="lead center" style={{ marginInline: "auto", marginTop: 40 }}>The full text: <a href={PRIVACY} style={{ textDecoration: "underline" }}>privacy policy</a> and <a href={TERMS} style={{ textDecoration: "underline" }}>terms of service</a>.</p>
        </div>
      </section>
      <Closing />
    </main>
  );
}
