import type { ApplicationStatus, FailureKind, NeedsInput } from "@/lib/jobs/api"

// One vocabulary for an application's state, used by the results rows, the
// applications list and the application page. A bare "Failed" next to a job
// says nothing; every label names the thing that is in that state.
export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: string; hint: string }> = {
  QUEUED: { label: "In apply queue", tone: "bg-secondary text-secondary-foreground", hint: "Waiting for its turn. Plato applies one at a time." },
  IN_PROGRESS: { label: "Applying now", tone: "bg-info-soft text-info", hint: "Plato is filling and submitting the form right now." },
  NEEDS_INPUT: { label: "Needs you", tone: "bg-warning-soft text-warning", hint: "Plato can't finish this one alone." },
  NEEDS_USER_VERIFICATION: { label: "Verify you're human", tone: "bg-warning-soft text-warning", hint: "The site asks for a person. Complete the check, then continue." },
  SUBMITTED: { label: "Applied", tone: "bg-success-soft text-success", hint: "Plato submitted this application for you." },
  FAILED: { label: "Apply failed", tone: "bg-destructive/10 text-destructive", hint: "Plato tried to apply and could not." },
  EXPIRED: { label: "Posting closed", tone: "bg-muted text-muted-foreground", hint: "The employer closed this posting before Plato could apply." },
  SKIPPED: { label: "Skipped by Plato", tone: "bg-muted text-muted-foreground", hint: "Plato decided not to apply to this one." },
  EXTENSION_ACTIVE: { label: "In your browser", tone: "bg-info-soft text-info", hint: "The Plato browser extension is working on this one with you. You press Submit." },
}

// Short, human names for why an application didn't go through.
export const FAILURE_KIND: Record<FailureKind, string> = {
  human_check: "Human check on the site",
  unknown_fact: "Needs a fact about you",
  invalid_answer: "An answer was rejected",
  ineligible: "Not a fit",
  duplicate: "Same role already handled",
  closed: "Posting closed",
  site_error: "The site had a problem",
  unsupported: "Site not supported",
  dry_run: "Dry run",
  no_resume: "No CV on file",
  blocked_by_site: "The site doesn't allow this",
  not_submitted: "You didn't submit it",
}

// The backend stores whatever kind the extension reports; an unknown one reads
// as a plain failure instead of crashing the page.
export const failureLabel = (kind: string | null | undefined) => (kind ? (FAILURE_KIND as Record<string, string>)[kind] ?? "Didn't go through" : null)

const NEEDS: Record<NeedsInput["reason"], string> = {
  questions: "The employer requires facts Plato doesn't know about you yet.",
  ready: "Everything is prepared. Submit it yourself, then mark it as submitted.",
  captcha: "The site asked for a human check. Open it and submit yourself.",
  unsupported: "Plato can't apply on this site yet. Apply there yourself.",
  profile: "Your application details are incomplete.",
  resume: "This job asks for skills your profile doesn't show. Confirm what is true before Plato writes your resume.",
  verify_submission: "Plato can't tell whether this was sent. Check the site or your email for a confirmation before you apply again. Plato will not send it again by itself.",
}

// Browser-extension applications keep status EXTENSION_ACTIVE (the duplicate
// lock) while Plato can't tell if the form went through: that is a "needs you".
export const isVerifySubmission = (app: { status: ApplicationStatus; needs_input?: NeedsInput | null }) =>
  app.status === "EXTENSION_ACTIVE" && app.needs_input?.reason === "verify_submission"

export const needsAttention = (app: { status: ApplicationStatus; needs_input?: NeedsInput | null }) =>
  app.status === "NEEDS_INPUT" || app.status === "NEEDS_USER_VERIFICATION" || isVerifySubmission(app)

// Label, tone and hint for an application, aware of the VERIFY case.
export const statusView = (app: { status: ApplicationStatus; needs_input?: NeedsInput | null }) =>
  isVerifySubmission(app)
    ? { label: "Please check", tone: "bg-warning-soft text-warning", hint: NEEDS.verify_submission }
    : APPLICATION_STATUS[app.status]

// The one-line "what happened", in plain words.
export function applicationReason(app: { status: ApplicationStatus; error?: string | null; needs_input?: NeedsInput | null }): string {
  if ((app.status === "FAILED" || app.status === "SKIPPED") && app.error) return app.error
  // The worker writes the exact situation (window open / timed out / no window).
  if (app.status === "NEEDS_USER_VERIFICATION") return app.needs_input?.message ?? APPLICATION_STATUS.NEEDS_USER_VERIFICATION.hint
  if (isVerifySubmission(app)) return NEEDS.verify_submission
  if (app.status === "NEEDS_INPUT" && app.needs_input) return NEEDS[app.needs_input.reason]
  if (app.status === "QUEUED" && app.error) return `Last attempt: ${app.error}`
  return APPLICATION_STATUS[app.status].hint
}

// Can Plato run this one again? Anything that ended without being sent,
// except rows that are waiting for the seeker's answers or details.
export const canRetry = (app: { status: ApplicationStatus; needs_input?: NeedsInput | null }) =>
  app.status === "FAILED" || app.status === "EXPIRED" || app.status === "SKIPPED" || (app.status === "NEEDS_INPUT" && app.needs_input?.reason === "ready")

export const retryLabel = (app: { status: ApplicationStatus; failure_kind?: string | null }) =>
  app.status === "SKIPPED" && app.failure_kind === "ineligible" ? "Apply anyway" : app.status === "NEEDS_INPUT" ? "Run again" : "Try again"

export const applicationHref = (id: string) => `/applications/${id}`

// Worker step -> position on the shared 6-stage stepper (0 = Analyzing jobs,
// already behind us once an application exists).
export const STEP_STAGE: Record<string, number> = { claimed: 1, checking: 1, mapping: 2, drafting: 2, needs_input: 3, filling: 4, human_check: 4, verified: 4, submitting: 4, retrying: 4, submitted: 6 }
export const STATUS_STAGE: Record<ApplicationStatus, number> = { QUEUED: 1, IN_PROGRESS: 4, NEEDS_INPUT: 3, NEEDS_USER_VERIFICATION: 4, SUBMITTED: 6, FAILED: 4, EXPIRED: 1, SKIPPED: 1, EXTENSION_ACTIVE: 4 }

// "about 40 sec" / "about 6 min": an estimate, so never more precise than that.
export const roughly = (seconds: number) => (seconds < 90 ? `about ${Math.max(10, Math.round(seconds / 10) * 10)} sec` : `about ${Math.round(seconds / 60)} min`)
