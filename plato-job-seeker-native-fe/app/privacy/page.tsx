import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy policy | Plato",
  description: "What Plato stores, what it sends where, and how to delete it.",
}

// Public, no login. Linked from the Chrome Web Store listing of the Plato Apply extension (a privacy policy URL is
// required there) and from the app. Plain statements of what the code actually does; keep it true when the code changes.
const UPDATED = "2 November 2026"
const CONTACT = "raefalwani06@gmail.com"

export default function PrivacyPage() {
  return (
    <main className="theme-app min-h-dvh bg-background text-foreground">
      <article className="mx-auto max-w-2xl px-5 py-12 text-[15px] leading-7">
        <h1 className="text-3xl font-bold">Privacy policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Plato (platohiring.com) and the Plato Apply Chrome extension. Updated {UPDATED}.</p>

        <h2 className="mt-8 text-xl font-semibold">What Plato is</h2>
        <p className="mt-2">Plato helps a job seeker find jobs and apply to them. You create an account, build a profile, search jobs, and apply. The Plato Apply extension fills application forms in your own browser from that profile, for the jobs you chose.</p>

        <h2 className="mt-8 text-xl font-semibold">What we store</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li><b>Account:</b> your name, email address and a hashed password (never the password itself).</li>
          <li><b>Profile:</b> what you enter or upload to be used in applications: work history, education, skills, links, preferences, and your resume files. Resume files are stored in private object storage (Cloudflare R2) and served only to you.</li>
          <li><b>Job activity:</b> your searches, the jobs you saved or applied to, the application status, and the answers you gave to application questions so you are not asked twice.</li>
          <li><b>Usage:</b> how many AI tokens your account used, for the credit balance and for cost reporting.</li>
          <li><b>Email:</b> which alert emails we sent you and your alert settings.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">Where your data goes</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li><b>AI providers (OpenAI, Anthropic):</b> to rank jobs, write answers and drive the extension, your profile and the text of the job posting or application form are sent to these providers for processing. They are not used to train their models under the terms we use.</li>
          <li><b>Job sources:</b> your search terms are sent to public job boards and aggregators to fetch listings. Your profile is not.</li>
          <li><b>The employer:</b> when you apply, what you submit (profile details, resume, answers) goes to that employer's application form, exactly as you would submit it yourself.</li>
          <li><b>Email delivery:</b> account emails (confirmation, password reset, job alerts) are sent through an email delivery service that sees your address and the message.</li>
          <li><b>Error monitoring:</b> when enabled, crash reports may include a user id; passwords, tokens and keys are stripped before they leave the server.</li>
        </ul>
        <p className="mt-2">We do not sell your data, show ads, or share it with anyone else.</p>

        <h2 className="mt-8 text-xl font-semibold">The Chrome extension</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>It talks only to <code>api.platohiring.com</code>. There is no analytics and no third-party code in it.</li>
          <li>It reads and fills the job application page you asked Plato to apply on, and nothing else. It attaches Chrome&apos;s debugger to that one tab while a run is going, to click and type the way you would, and detaches when the run ends.</li>
          <li>It keeps a pairing token for your Plato account in the extension&apos;s local storage. Unlinking the browser in the extension or on the website revokes it.</li>
          <li>It stops and asks you when a form needs something your profile does not hold, and always stops for a human check (captcha).</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">Cookies</h2>
        <p className="mt-2">One session cookie keeps you signed in to the website. No tracking cookies.</p>

        <h2 className="mt-8 text-xl font-semibold">Deleting your data</h2>
        <p className="mt-2">Email <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> from your account address and we delete the account, profile, files and application history. Copies already submitted to employers stay with them.</p>

        <h2 className="mt-8 text-xl font-semibold">Contact</h2>
        <p className="mt-2">Questions about this policy: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </article>
    </main>
  )
}
