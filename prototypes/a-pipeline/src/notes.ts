// "Why it changed" notes shown on each screen when Design notes are on.
// Written for the business owner reviewing the prototype against today's app.

export const NOTES: Record<string, { title: string; points: string[] }> = {
  welcome: {
    title: "Onboarding: 4 steps became 3 honest ones",
    points: [
      "Upload, check what Plato understood, say what you want. Confirm and preferences no longer repeat each other, and the old 'Ready' page is gone.",
      "Application details (notice period, work authorization) are asked here once, marked optional, so Plato never sends people back into a wizard later.",
      "Finishing starts a real first search. The old last step said Plato had 'already analyzed thousands' of jobs before any search ran.",
    ],
  },
  today: {
    title: "Today replaces the 12-chart dashboard",
    points: [
      "The top of the page is what needs you, and each item can be finished right here: answer, verify, or mark as submitted.",
      "Below it: what Plato is doing right now, and what's new since your last visit. Three numbers instead of twelve charts.",
      "The 5-step checklist shows only while something is missing, and each step opens the exact field in Me.",
    ],
  },
  jobs: {
    title: "One board for the whole hunt",
    points: [
      "Jobs, search results, Saved, Applications and Job alerts were 5 places. Now each job is one card that moves left to right: New → Saved → Applying → Needs you → Applied.",
      "A search is now a saved search that keeps running. Its alert setting (daily / weekly / off) lives on the search itself, so 'Job alerts' is no longer a separate page.",
      "Apply is a confirmation that says what will happen to each job: Plato applies, it needs Plato for Chrome, or you apply on the site. Nothing is queued until you confirm.",
      "Drag cards between columns, or select several and act on them together.",
    ],
  },
  career: {
    title: "Career: three tools, each with one entry point",
    points: [
      "Resumes: your base CV plus one tailored version per job, each with its keyword match and an Approve step before Plato uses it.",
      "Interview practice: one place for text and voice, every session in one history with scores. Start from a job and the questions are about that job.",
      "Skills: the gap is computed from your real matches. Finishing a course adds the skill to Me with proof, so there is one skills list instead of three.",
    ],
  },
  me: {
    title: "Me: everything Plato knows about you, in one page",
    points: [
      "Before, this was spread over onboarding steps 2–4, Profile, Career and Extension, and 'Edit my details' sent you back into the onboarding wizard.",
      "The readiness meter says exactly what is missing for Plato to apply without asking, and jumps to that field.",
      "Every field saves on its own. Plan, tokens, notifications and Plato for Chrome are sections here instead of separate pages.",
    ],
  },
  plato: {
    title: "One Plato with one history",
    points: [
      "Before there were five chats (search, global, career, onboarding, interviews) with separate histories. Now one Plato follows you everywhere and knows which page and job you're looking at.",
      "Replies come with buttons that do the thing: create the search, open the job, start the interview.",
    ],
  },
}
