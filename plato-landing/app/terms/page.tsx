import type { Metadata } from "next";
import { Legal, type LegalSection } from "@/components/legal";
import { CONTACT } from "@/components/links";

export const metadata: Metadata = { title: "Terms of service", description: "The terms for using Plato and the Plato Apply extension." };

const UPDATED = "3 November 2026";

const sections: LegalSection[] = [
  { id: "service", title: "The service", body: <p>Plato (jobs.platohiring.com) and the Plato Apply Chrome extension help you find jobs and apply to them with information from your own profile. By creating an account or installing the extension you agree to these terms. If you do not agree, do not use Plato.</p> },
  { id: "your-account", title: "Your account", body: (
    <ul>
      <li>You must be at least 16 and give accurate information about yourself. Applications are made in your name; what goes into them is your responsibility.</li>
      <li>Keep your password to yourself. Anything done from your account is treated as done by you, until you tell us it was not.</li>
      <li>One account per person. You may close it at any time (see the <a href="/privacy/#deleting">privacy policy</a>).</li>
    </ul>
  ) },
  { id: "applications", title: "Applications made on your behalf", body: (
    <ul>
      <li>Plato applies only to jobs you selected, with the profile and answers you provided. Review your profile before you start a batch; Plato fills forms from it as it is.</li>
      <li>When a form asks something your profile does not answer, Plato asks you. Your answer is used for that application and kept for later ones until you change it.</li>
      <li>Plato presses Submit once per application and records what the site shows afterwards. It does not promise that an employer receives, reads or answers an application; sites change, fail and filter.</li>
      <li>Plato does not solve captchas or work around site protections, and will not apply to a job twice. Follow the terms of the job sites you apply on.</li>
    </ul>
  ) },
  { id: "credits", title: "Credits and payment", body: <p>AI features consume credits (tokens) from your balance. Free credits are granted per period; paid credits, where offered, are charged as shown at the time of purchase and are not refundable once used. Balances are shown in the app.</p> },
  { id: "acceptable-use", title: "Acceptable use", body: (
    <ul>
      <li>Do not use Plato to apply for other people without their consent, to submit false information, or to spam employers.</li>
      <li>Do not probe, overload or reverse-engineer the service, and do not share your account or the extension&apos;s pairing token.</li>
      <li>We may suspend an account that breaks these rules or harms the service or others.</li>
    </ul>
  ) },
  { id: "content", title: "Your content", body: <p>Your profile, resume and answers stay yours. You give Plato the right to store them and to send them, on your instruction, to AI providers and to the employers you apply to, as described in the <a href="/privacy/">privacy policy</a>. Nothing else.</p> },
  { id: "availability", title: "Availability and changes", body: <p>Plato is provided as is. We work to keep it up and accurate, but we do not guarantee uninterrupted service, that every job site will keep working with the extension, or that a job listing is current. Features may change; material changes are announced by email.</p> },
  { id: "liability", title: "Liability", body: <p>To the extent the law allows, Plato is not liable for indirect or consequential loss, for the outcome of any application, or for the acts of job sites, employers or third-party providers. Our total liability for any claim is limited to what you paid Plato in the three months before it.</p> },
  { id: "termination", title: "Ending the agreement", body: <p>You can stop at any time by deleting your account and removing the extension. We can end or suspend access for a breach of these terms, with notice where practical. Sections on content, liability and law survive.</p> },
  { id: "law", title: "Law and contact", body: <p>These terms are governed by the laws of Egypt. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p> },
];

export default function TermsPage() {
  return <Legal title="Terms of service" lead="The terms for using Plato and the Plato Apply extension." updated={UPDATED} sections={sections} other={{ href: "/privacy/", label: "Privacy policy" }} />;
}
