import type { Metadata } from "next";
import { Legal, type LegalSection } from "@/components/legal";
import { CONTACT } from "@/components/links";

export const metadata: Metadata = { title: "Privacy policy", description: "What Plato stores, where it sends it, and how to delete it." };

// Linked from the Chrome Web Store listing of the Plato Apply extension (a privacy policy URL is required there)
// and from the app. Plain statements of what the code actually does; keep it true when the code changes.
const UPDATED = "3 November 2026";

const sections: LegalSection[] = [
  { id: "what-plato-is", title: "What Plato is", body: <p>Plato helps a job seeker find jobs and apply to them. You create an account, build a profile, search jobs, and apply. The <b>Plato Apply</b> Chrome extension fills application forms in your own browser from that profile, for the jobs you chose. This policy covers the website (platohiring.com and jobs.platohiring.com), the API (api.platohiring.com) and the extension.</p> },
  { id: "what-we-store", title: "What we store", body: (
    <ul>
      <li><b>Account:</b> your name, email address and a hashed password. The password itself is never stored.</li>
      <li><b>Profile:</b> what you enter or upload to be used in applications: work history, education, skills, links, preferences, and your resume files. Resume files live in private object storage (Cloudflare R2) and are served only to you.</li>
      <li><b>Job activity:</b> your searches, the jobs you saved or applied to, each application&apos;s status, and the answers you gave to application questions so you are not asked twice.</li>
      <li><b>Usage:</b> how many AI tokens your account used, for the credit balance and for cost reporting.</li>
      <li><b>Email:</b> which alert emails we sent you and your alert settings.</li>
    </ul>
  ) },
  { id: "where-it-goes", title: "Where your data goes", body: (
    <>
      <ul>
        <li><b>AI providers (OpenAI, Anthropic):</b> to rank jobs, write answers and drive the extension, your profile and the text of the job posting or application form are sent to these providers for processing. Under the terms we use, they do not train their models on it.</li>
        <li><b>Job sources:</b> your search terms are sent to public job boards and aggregators to fetch listings. Your profile is not.</li>
        <li><b>The employer:</b> when you apply, what you submit (profile details, resume, answers) goes to that employer&apos;s application form, exactly as if you had submitted it yourself.</li>
        <li><b>Email delivery:</b> account emails (confirmation, password reset, job alerts) go through an email delivery service that sees your address and the message.</li>
        <li><b>Error monitoring:</b> when enabled, crash reports may include a user id. Passwords, tokens and keys are stripped before anything leaves the server.</li>
      </ul>
      <p>We do not sell your data, show ads, or share it with anyone else.</p>
    </>
  ) },
  { id: "extension", title: "The Chrome extension", body: (
    <ul>
      <li>It talks only to <code>api.platohiring.com</code>. There is no analytics and no third-party code in it.</li>
      <li>It reads and fills the job application page you asked Plato to apply on, and nothing else. While a run is going it attaches Chrome&apos;s debugger to that one tab, to click and type the way you would, and detaches when the run ends. It never reads your other tabs, console or network.</li>
      <li>It keeps a pairing token for your Plato account in the extension&apos;s local storage. Unlinking the browser, in the extension or on the website, revokes it.</li>
      <li>It stops and asks you when a form needs something your profile does not hold, and always stops for a human check (captcha). It never applies anywhere you did not choose, and never twice to the same job.</li>
    </ul>
  ) },
  { id: "cookies", title: "Cookies", body: <p>One session cookie keeps you signed in to the web app. The landing site sets none. No tracking cookies, no advertising cookies.</p> },
  { id: "retention", title: "How long we keep it", body: <p>As long as your account exists. Application history stays so you can see what was sent where; resume files stay until you replace or delete them. Server logs are rotated within weeks.</p> },
  { id: "deleting", title: "Deleting your data", body: <p>Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from your account address and we delete the account, profile, files and application history. Copies already submitted to employers stay with them.</p> },
  { id: "changes", title: "Changes to this policy", body: <p>When the product changes what it stores or where it sends it, this page changes with it and the date at the top moves. Material changes are announced by email.</p> },
  { id: "contact", title: "Contact", body: <p>Questions about this policy: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p> },
];

export default function PrivacyPage() {
  return <Legal title="Privacy policy" lead="What Plato stores, where it sends it, and how to delete it." updated={UPDATED} sections={sections} other={{ href: "/terms/", label: "Terms of service" }} />;
}
