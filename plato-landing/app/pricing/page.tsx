import type { Metadata } from "next";
import { TokensMock } from "@/components/mocks";
import { Closing, Faq, PageHero, Plans } from "@/components/sections";

export const metadata: Metadata = { title: "Pricing", description: "Free, Pro $19 and Max $59 a month. Tokens for search, resumes and interviews; applying through the extension is free." };

export default function Pricing() {
  return (
    <main>
      <PageHero eyebrow="Pricing" title={<>Tokens. <span className="grad">Applying is free</span>.</>} sub="One balance pays for searching, ranking, resumes, interviews and written answers. Every plan refills monthly. Top-ups never expire." />
      <section className="sec">
        <div className="wrap"><Plans /><p className="lead" style={{ marginTop: 24 }}>Online checkout opens soon. Until then, plans and top-ups are set up from your account.</p></div>
      </section>
      <section className="sec paper">
        <div className="wrap">
          <div className="feature">
            <div><span className="eyebrow">What a token buys</span><h3>See the cost before you spend it.</h3><p>Plato shows an estimate before each action and a history of where your tokens went: searches, tailored resumes, mock interviews, minutes of voice practice.</p>
              <ul><li>A new job search, ranked</li><li>A resume tailored to one posting</li><li>A mock interview on a posting</li><li>Minutes of voice practice</li><li>Applying with the extension: free</li></ul></div>
            <div><TokensMock /></div>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap"><span className="eyebrow">Questions</span><h2 className="h2">About tokens.</h2>
          <Faq items={[
            ["What happens when I run out?", "Nothing breaks. Your profile, searches and applications stay. Features that need tokens wait until the monthly refill or a top-up."],
            ["Do unused tokens carry over?", "Plan tokens reset each month. Top-up tokens never expire and are spent after your monthly grant."],
            ["Why is applying free?", "The extension works in your browser from your profile; the cost of running it is on us."],
            ["Can I change plans?", "Any time. The new plan starts a fresh period with its own monthly grant."],
          ]} />
        </div>
      </section>
      <Closing title="Start free. Upgrade when it pays for itself." />
    </main>
  );
}
