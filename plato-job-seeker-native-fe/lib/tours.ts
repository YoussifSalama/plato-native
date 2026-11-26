// What the "Take a tour" button walks through, page by page. Each step points
// at an element by CSS selector (data-tour hooks, or the data-ai names the
// assistant already uses); a step whose element is not on screen right now is
// skipped, and a step without a target is shown in the middle of the screen.
// A page with several screens on one route (a stepper, run then result, tabs) marks
// the one showing with data-tour-state="…" and gets the tour for that screen.

export type TourStep = { target?: string; title: string; body: string }
export type Tour = { id: string; name: string; steps: TourStep[] }

// Shown at the end of every tour: the things that are the same on every page.
const SHELL: TourStep[] = [
  { target: '[data-tour="sidebar-nav"]', title: "Everything, in the order you use it", body: "Home, Jobs, Applications, Following and Career. Your profile, plan and the extension sit at the bottom." },
  { target: '[data-tour="status-card"]', title: "Profile strength", body: "How ready Plato is to apply for you without stopping to ask. Click it for the next thing to add." },
  { target: '[data-tour="plato-ai"]', title: "Ask Plato anything", body: "Plato AI can do what any button does: start a search, open a job, explain a page. Type it in your own words." },
  { target: '[data-tour="tour-button"]', title: "Lost? Start here again", body: "This button gives a tour of whatever page you are on." },
]

// Shared steps for Career and the interview setup.
const CAREER_TABS: TourStep = { target: '[role="tablist"][aria-label="Career"]', title: "Every part of Career", body: "Overview, Quizzes, Interviews, Proof of skills, Skills gap, Snapshot and Practice library are one click apart here." }
const isInterviewId = (p: string) => /^\/career\/interviews\/[^/]+$/.test(p) && !["/career/interviews/new", "/career/interviews/general", "/career/interviews/simulate"].includes(p)

const STEPS_BAR: TourStep = { target: '[data-tour="interview-steps"]', title: "Where you are", body: "Step n of 7: five quick questions, the summary, then the interview itself. The bars fill as you go." }
const BACK: TourStep = { target: '[data-ai="interview.new.back"]', title: "Back", body: "Goes to the previous question. Your answers are kept." }
const NEXT_CHOICE: TourStep = { target: '[data-ai="interview.new.next"]', title: "Next", body: "Shows when you already answered this question. Click a card to change the answer, or Next to keep it." }

const TOURS: { match: (path: string, state: string | null) => boolean; tour: Tour }[] = [
  // ───────── Home, Jobs, one search, Tailor & apply, Messages
// ───────────────────────────── Home ─────────────────────────────
  {
    match: (p, s) => p === "/" && s === "home.new",
    tour: {
      id: "home-new",
      name: "Home",
      steps: [
        { title: "Welcome to Plato", body: "Plato searches job boards for you, ranks every posting against your profile and applies in your own browser. Here is how to get going." },
        { target: '[data-tour="next-steps"]', title: "Your next steps", body: "The path from sign-up to your first applications. Each step ticks itself off when it is done." },
        { target: '[data-ai="home.next-step"]', title: "Do the next one", body: "This button takes you straight to the step to do now." },
        { target: '[data-ai="home.first-search"]', title: "Start a search", body: "Tell Plato the role you want in your own words. Your best matches show up here once it has ranked them." },
        { target: '[data-tour="home-recent"]', title: "Your applications", body: "Empty for now. What Plato sends for you, and what comes of it, shows up here." },
        { target: '[data-tour="home-following"]', title: "Companies you follow", body: "Follow companies and roles, and Plato tells you when they post a job that fits." },
        ...SHELL,
      ],
    },
  },
  {
    match: (p) => p === "/",
    tour: {
      id: "home",
      name: "Home",
      steps: [
        { target: '[data-tour="page-header"]', title: "Your day in one line", body: "Under the greeting, Plato tells you where your job hunt stands right now." },
        { target: '[data-tour="home-kpis"]', title: "Your week in numbers", body: "New matches, applications sent, interviews you marked, and your goal for this week. Click a number to open that list." },
        { target: '[data-tour="next-steps"]', title: "Your next steps", body: "What is left of the setup. The highlighted step is the one to do now; it ticks itself off when done." },
        { target: '[data-tour="home-top-matches"]', title: "Your best matches", body: "The top jobs for you right now, with why each one fits. Apply sends it to the extension; the bookmark saves it. See all opens Jobs." },
        { target: '[data-tour="home-recent"]', title: "Your applications", body: "What Plato sent lately and what came of it. Open one for every step." },
        { target: '[data-tour="home-following"]', title: "Companies you follow", body: "New roles from your latest digest at companies you follow." },
        ...SHELL,
      ],
    },
  },

// ───────────────────────────── Jobs ─────────────────────────────
  {
    match: (p, s) => p === "/jobs" && s === "jobs.new",
    tour: {
      id: "jobs-new",
      name: "Jobs",
      steps: [
        { target: '[data-tour="page-header"]', title: "All your jobs, one list", body: "Every job from every search you run lands here, best match first. It is empty until your first search." },
        { target: '[data-ai="jobs.new-search"]', title: "New search", body: "Opens a chat with Plato. Say the role, the place and anything else that matters, in your own words." },
        { target: '[data-tour="jobs-searches"]', title: "Your searches", body: "Each search you run is kept here, grouped by day. Pick one to open its jobs." },
        { target: '[data-ai="jobs.following"]', title: "Following", body: "Follow companies and roles to hear when they post a job that fits." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p, s) => p === "/jobs" && !!s?.endsWith(".empty"),
    tour: {
      id: "jobs-empty",
      name: "Jobs",
      steps: [
        { target: '[data-tour="results-list"]', title: "Nothing in this list", body: "Saved fills when you bookmark a job, Applied when Plato applies for you, Hidden when you mark a job not interested." },
        { target: '[role="tablist"][aria-label="Jobs"]', title: "Switch lists", body: "For you, Saved, Applied and Hidden. For you holds every match." },
        { target: '[data-ai="results.filters"]', title: "Check your filters", body: "A filter can hide every job. Clear filters, or turn Can apply from off, to see more." },
        { target: '[data-tour="results-search"]', title: "Check the search box", body: "Every word you type must appear in the job. Remove one to widen it." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p) => p === "/jobs",
    tour: {
      id: "jobs",
      name: "Jobs",
      steps: [
        { target: '[data-tour="page-header"]', title: "Every job ranked for you", body: "All jobs from all your searches in one list, best match first. It looks and works like one search's page." },
        { target: '[data-tour="results-search"]', title: "Find a job", body: "Type a title, company, place or skill. Every word must appear in the job, in any order." },
        { target: '[data-tour="jobs-toolbar"]', title: "Your searches", body: "Pick a search to open its jobs; All jobs shows everything. New search starts another one with Plato." },
        { target: '[data-tour="results-summary"]', title: "Apply in one go", body: "Apply to top 15 queues your best matches in the browser extension. Nothing is sent until you start it there." },
        { target: '[role="tablist"][aria-label="Jobs"]', title: "Four lists", body: "For you is every match. Saved, Applied and Hidden are the jobs you bookmarked, sent and passed on." },
        { target: '[data-ai="results.filters"]', title: "Narrow it down", body: "Where you can apply from, remote only, location, level, job type, how recent, salary and source. Each menu shows how many jobs it keeps." },
        { target: '[data-ai^="results.open:"]', title: "On every job", body: "Open the posting, save it, or hide it. Tick jobs to apply to just those; a bar at the bottom keeps them in reach." },
        ...SHELL.slice(2),
      ],
    },
  },

// ───────────────────────── Tailor & apply ─────────────────────────
  {
    match: (p, s) => p === "/jobs/review" && s === "review.empty",
    tour: {
      id: "review-empty",
      name: "Tailor & apply",
      steps: [
        { title: "Nothing to review yet", body: "This page writes one resume for each job you pick, and shows what changed before anything is sent." },
        { target: '[data-tour="review-back"]', title: "Pick jobs first", body: "On Jobs, tick the jobs you want and press Tailor & apply in the bar at the bottom." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/jobs/review" && s === "review.writing",
    tour: {
      id: "review-writing",
      name: "Tailor & apply",
      steps: [
        { target: '[data-tour="page-header"]', title: "One resume per job", body: "Plato writes them one at a time from your profile and the job post. Each one costs tokens; approving costs nothing." },
        { target: '[data-tour="review-progress"]', title: "How far it is", body: "How many are written and how many you approved." },
        { target: '[data-tour="review-queue"]', title: "Every job you picked", body: "Each shows its state: queued, writing, ready to review, approved. Click one to open it." },
        { target: '[data-tour="review-detail"]', title: "This one is being written", body: "You can open a finished one meanwhile; nothing is lost." },
        { target: '[data-ai="review.approve-all"]', title: "Then apply", body: "Approve all & apply works once resumes are written." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/jobs/review" && s === "review.gaps",
    tour: {
      id: "review-gaps",
      name: "Tailor & apply",
      steps: [
        { target: '[data-tour="review-gaps"]', title: "Check these skills first", body: "The job asks for skills your profile doesn't show. Tick only what is true, then Write the resume, or use your original." },
        { target: '[data-tour="review-queue"]', title: "The other jobs", body: "Plato keeps writing the rest. Click one to open it." },
        { target: '[data-ai="review.approve-all"]', title: "Then apply", body: "Approve all & apply sends every approved job to the extension." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/jobs/review" && s === "review.error",
    tour: {
      id: "review-error",
      name: "Tailor & apply",
      steps: [
        { target: '[data-tour="review-error"]', title: "This one failed", body: "The reason is shown. Try again writes it once more." },
        { target: '[data-tour="review-queue"]', title: "The other jobs", body: "The rest carry on. Click one to open it." },
        { target: '[data-ai="review.approve-all"]', title: "Apply to the rest", body: "Approve all & apply sends the written ones; a failed job is left out." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/jobs/review",
    tour: {
      id: "review",
      name: "Tailor & apply",
      steps: [
        { target: '[data-tour="page-header"]', title: "One resume per job", body: "Plato writes a resume for each job you picked. You only see what changed from your master resume." },
        { target: '[data-tour="review-queue"]', title: "Every job you picked", body: "Click one to open its resume. Approved ones are marked." },
        { target: '[data-tour="review-changes"]', title: "What changed", body: "Before and after for the summary, the order of your experience and the keywords. The match score is next to the job title." },
        { target: '[data-ai="review.approve"]', title: "Approve it", body: "Approves this resume and moves to the next one." },
        { target: '[data-tour="review-original"]', title: "Or keep your own", body: "Use my original resume sends your profile resume to this job instead." },
        { target: '[data-ai="review.approve-all"]', title: "Then apply", body: "Approve all & apply sends every approved job to the extension. Weak fits under 65 are left out unless you approve them yourself." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

// ───────────────────────────── Messages ─────────────────────────────
  {
    match: (p) => p === "/messages",
    tour: {
      id: "messages",
      name: "Messages",
      steps: [
        { target: '[data-tour="page-header"]', title: "Messages are coming", body: "Messages from employers will land here, next to the application they belong to." },
        { target: '[data-tour="coming-soon-meanwhile"]', title: "Until then", body: "Employer updates show in Notifications and on each application." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

// ───────────────────────── One search (/jobs/<id>) ─────────────────────────
// The full-screen chat replaces the Plato AI launcher on search.start / search.chat, so those end with the tour button only.
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.start",
    tour: {
      id: "search-start",
      name: "New search",
      steps: [
        { target: '[data-tour="page-header"]', title: "A new search", body: "You set it up by chatting with Plato. Jobs in the breadcrumb takes you back to all your jobs." },
        { target: '[data-tour="search-known"]', title: "What Plato already knows", body: "Your roles, places, work setup and experience from your profile. It searches with these unless you say otherwise." },
        { target: '[data-tour="search-suggestions"]', title: "Start in one click", body: "Search the roles you saved, look only at remote roles, or tell Plato something different." },
        { target: '[data-tour="search-composer"]', title: "Or say it your way", body: "Type the role, the place and anything that matters. The cost of a message and of a search is shown underneath." },
        ...SHELL.slice(3),
      ],
    },
  },
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.chat",
    tour: {
      id: "search-chat",
      name: "New search",
      steps: [
        { target: '[data-tour="search-transcript"]', title: "Pinning down your search", body: "Plato asks a few short questions before it searches. Nothing runs until you agree." },
        { target: '[data-tour="search-question"]', title: "Answer in a click", body: "Pick an option here, or type your own answer below." },
        { target: '[data-tour="search-composer"]', title: "Reply", body: "Enter sends, Shift+Enter starts a new line." },
        { target: '[data-tour="page-actions"]', title: "Start over", body: "New search opens a fresh chat. This one is kept in your searches." },
        ...SHELL.slice(3),
      ],
    },
  },
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.running",
    tour: {
      id: "search-running",
      name: "Search running",
      steps: [
        { target: '[data-tour="page-header"]', title: "Plato is searching", body: "It keeps going if you leave. You get a notification when it is done." },
        { target: '[data-tour="search-progress"]', title: "Live, step by step", body: "Says whether the search is running, complete or stopped." },
        { target: '[data-tour="search-journey"]', title: "Every board it checks", body: "Each step on the map is a real event from the search: the boards, the jobs found and how they rank." },
        { target: '[data-tour="search-notes"]', title: "Plato's notes", body: "The same steps in plain words. The dot shows notes you haven't read." },
        { target: '[data-tour="search-stages"]', title: "What comes after", body: "Once the jobs are ranked: check requirements, gather what is needed, you confirm, Plato applies." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.failed",
    tour: {
      id: "search-failed",
      name: "Search results",
      steps: [
        { target: '[data-tour="search-failed"]', title: "The search stopped", body: "The reason is shown here. Any jobs it ranked before stopping are still below." },
        { target: '[data-tour="plato-ai"]', title: "Ask Plato to try again", body: "Open Plato AI and ask it to run the search again, or change it." },
        { target: '[data-tour="page-actions"]', title: "Or start fresh", body: "New search opens a new chat with Plato." },
        { target: '[data-tour="results-list"]', title: "What it found so far", body: "Jobs ranked before the search stopped, if any." },
        ...SHELL.slice(3),
      ],
    },
  },
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.saved",
    tour: {
      id: "search-saved",
      name: "Saved jobs",
      steps: [
        { target: '[data-tour="results-tabs"]', title: "Your shortlist", body: "Saved holds the jobs you bookmarked, from every search." },
        { target: '[data-tour="results-list"]', title: "Tick to apply", body: "Tick jobs to apply to them. The bookmark on a row takes it off the list." },
        { target: '[data-ai="results.apply-selected"]', title: "Your selection", body: "Tick jobs, then Apply to selected sends them to the extension. A bar at the bottom keeps your picks in reach." },
        { target: '[data-tour="plato-ai"]', title: "Talk to it", body: "Ask Plato AI to compare jobs or explain a match." },
        ...SHELL.slice(3),
      ],
    },
  },
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.applied",
    tour: {
      id: "search-applied",
      name: "Applied jobs",
      steps: [
        { target: '[data-tour="results-tabs"]', title: "Everything you sent", body: "Applied lists the jobs you asked Plato to apply to, from every search." },
        { target: '[data-tour="results-row-status"]', title: "Where each one stands", body: "Queued, applying, applied or needs you. Click it to open the application." },
        { target: '[data-tour="results-list"]', title: "When something went wrong", body: "A row says what happened, with a link to see the details. A failed job can be ticked again." },
        { target: '[data-tour="plato-ai"]', title: "Talk to it", body: "Ask Plato AI what is happening with an application." },
        ...SHELL.slice(3),
      ],
    },
  },
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.recommended",
    tour: {
      id: "search-recommended",
      name: "Recommended for you",
      steps: [
        { target: '[data-tour="results-tabs"]', title: "Best from all your searches", body: "Jobs at 75% match or more from every search, minus the ones you hid or applied to." },
        { target: '[data-tour="results-list"]', title: "Tick, open, save", body: "The title opens the posting. Tick jobs to apply, or bookmark them." },
        { target: '[data-ai="results.apply-top"]', title: "Apply in one go", body: "Sends the best matches to the browser extension. It fills each form and presses Submit once, in tabs you can watch." },
        { target: '[data-tour="plato-ai"]', title: "Talk to it", body: "Ask Plato AI to compare jobs or explain a match." },
        ...SHELL.slice(3),
      ],
    },
  },
  {
    match: (p, s) => /^\/jobs\/(?!review$)[^/]+$/.test(p) && s === "search.results",
    tour: {
      id: "search-results",
      name: "Search results",
      steps: [
        { target: '[data-tour="results-summary"]', title: "What Plato found", body: "How many strong and excellent matches, and how well the best one fits your profile." },
        { target: '[data-ai="results.apply-top"]', title: "Apply in one go", body: "Sends the 15 best matches to the browser extension. It fills each form and presses Submit once, in tabs you can watch." },
        { target: '[data-tour="results-tabs"]', title: "Discover, saved, applied", body: "Discover is this search. Saved, Applied and Recommended gather jobs from all your searches." },
        { target: '[data-ai="results.filters"]', title: "Narrow it down", body: "One row of filters: where you can apply from, remote only, then location, level, job type, how recent, salary and source. Each menu shows how many jobs it keeps. Sort, rows or cards, and export sit above it; the box at the top searches by title or company." },
        { target: '[data-tour="results-list"]', title: "Tick, open, save", body: "The title opens the posting. Tick jobs to apply to them; the bookmark saves one." },
        { target: '[data-ai^="results.open:"]', title: "On every job", body: "Open the posting, save it, or hide it. The … menu has interview practice for this job and Copy link." },
        { target: '[data-ai="results.apply-selected"]', title: "Your selection", body: "Tick jobs, then Apply to selected sends just those. A bar at the bottom keeps your picks in reach." },
        { target: '[data-tour="plato-ai"]', title: "Talk to it", body: "Ask Plato AI to refine this search, compare jobs or explain a match. It works on this page with you." },
        ...SHELL.slice(3),
      ],
    },
  },
  {
    match: (p) => /^\/jobs\/(?!review$)[^/]+$/.test(p),
    tour: {
      id: "results",
      name: "Search",
      steps: [
        { target: '[data-tour="page-header"]', title: "One search", body: "You set it up by chatting with Plato. While it runs you see live progress; when it is done, every job is ranked against your profile, best first." },
        ...SHELL.slice(2),
      ],
    },
  },

  // ───────── Applications, Following, Notifications, Extension, Plan & credits, Profile
  // ---------------------------------------------------------------- /applications
  {
    match: (p, s) => p === "/applications" && s === "applications.empty",
    tour: {
      id: "applications-empty",
      name: "Applications",
      steps: [
        { target: '[data-tour="page-header"]', title: "Everything Plato applies to", body: "Each job Plato sends for you lands here, with where it stands. Nothing has been sent yet." },
        { target: '[data-tour="applications-readiness"]', title: "One thing first", body: "Plato needs these details once before it can apply anywhere. Complete my details fixes it." },
        { target: '[data-tour="applications-find-jobs"]', title: "Start here", body: "Find jobs opens your searches. Tick jobs and press Apply; they show up on this page." },
        { target: '[data-tour="applications-needs"]', title: "Needs you", body: "If Plato ever has to stop and ask you something, the job waits here with one button to answer." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p, s) => p === "/applications" && s === "applications.needs",
    tour: {
      id: "applications-needs",
      name: "Applications",
      steps: [
        { target: '[data-tour="page-header"]', title: "Everything Plato applied to", body: "Each job Plato sent for you, with where it stands. It updates live." },
        { target: '[data-tour="need-card"]', title: "Plato is waiting on you", body: "Plato paused these because only you can give what is missing: an answer, a skills check or a human check on the site." },
        { target: '[data-tour="need-action"]', title: "One button each", body: "Answer opens the questions right here. Your answers are remembered for every later employer." },
        { target: '[data-tour="applications-stats"]', title: "Your numbers", body: "Sent in 30 days, sent this week, the share that went through, and how many need you." },
        { target: '[role="tablist"][aria-label="Applications"]', title: "Filter by status", body: "All, In progress, Sent and Didn't go through." },
        { target: '[data-ai^="applications.row:"]', title: "Open one for the details", body: "Every step, what was sent, the resume used and a screenshot as proof." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/applications",
    tour: {
      id: "applications",
      name: "Applications",
      steps: [
        { target: '[data-tour="page-header"]', title: "Everything Plato applied to", body: "Each job Plato sent for you, with where it stands. It updates live." },
        { target: '[data-tour="applications-stats"]', title: "Your numbers", body: "Sent in 30 days, sent this week, the share that went through, and how many need you." },
        { target: '[role="tablist"][aria-label="Applications"]', title: "Filter by status", body: "All, In progress, Sent and Didn't go through. The counts show how many are in each." },
        { target: '[data-ai^="applications.row:"]', title: "Open one for the details", body: "Every step, what was sent, the resume used and a screenshot as proof." },
        { target: '[data-ai^="applications.retry:"]', title: "Try again", body: "When something went wrong on the employer's site, put it back in the queue." },
        { target: '[data-tour="applications-needs"]', title: "Needs you", body: "Anything Plato paused on waits here. Right now nothing needs you." },
        { target: '[data-tour="applications-pager"]', title: "More pages", body: "Twenty per page. Use the arrows to see the rest." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ---------------------------------------------------------------- /applications/<id>
  {
    match: (p, s) => /^\/applications\/[^/]+$/.test(p) && s === "application.needs",
    tour: {
      id: "application-needs",
      name: "Application",
      steps: [
        { target: '[data-tour="application-hero"]', title: "Plato paused this one", body: "The job, the company and why Plato stopped. It goes on as soon as you answer." },
        { target: '[data-tour="application-review"]', title: "Answer here", body: "The questions the form asks that Plato can't answer from your profile, or the check only a person can do. Answers are remembered for every employer." },
        { target: '[data-tour="application-stepper"]', title: "Where it is", body: "The stages from queued to sent. The highlighted one is now." },
        { target: '[data-tour="application-steps"]', title: "Every step so far", body: "What Plato or the extension did, with times." },
        { target: '[data-tour="application-sent"]', title: "What Plato prepared", body: "The resume it picked and the answers it filled in so far." },
        { target: '[data-ai="application.withdraw"]', title: "Don't want it?", body: "Remove takes it off Plato's list. It asks you to confirm first." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => /^\/applications\/[^/]+$/.test(p) && s === "application.verify",
    tour: {
      id: "application-verify",
      name: "Application",
      steps: [
        { target: '[data-tour="application-hero"]', title: "Not sure it was sent", body: "The form was filled but no confirmation page was seen, so it may or may not have reached the employer." },
        { target: '[data-tour="application-actions"]', title: "Check the site", body: "Open the employer's site or your email to see if it arrived before applying again." },
        { target: '[data-tour="application-confirmation"]', title: "Why Plato isn't sure", body: "Plato counts it as sent only when the employer's page confirms it, or you confirm you pressed Submit." },
        { target: '[data-tour="application-steps"]', title: "Every step", body: "What the extension did in your browser, with times." },
        { target: '[data-tour="application-proof"]', title: "What the page looked like", body: "A screenshot of the employer's page at the end, when one was saved." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => /^\/applications\/[^/]+$/.test(p) && s === "application.sent",
    tour: {
      id: "application-sent",
      name: "Application",
      steps: [
        { target: 'nav[aria-label="Breadcrumb"]', title: "One application", body: "Applications takes you back to the list, on the same tab." },
        { target: '[data-tour="application-hero"]', title: "Sent", body: "The job, the company and when it went out." },
        { target: '[data-tour="application-confirmation"]', title: "How Plato knows", body: "The confirmation the employer's page showed, or that you confirmed it yourself." },
        { target: '[data-tour="application-proof"]', title: "Proof of apply", body: "A screenshot of the confirmation page. Open it full size or download it." },
        { target: '[data-tour="application-resume"]', title: "Resume used", body: "Tailored for this job or your original. Open or download the exact PDF that was sent." },
        { target: '[data-tour="application-answers"]', title: "Answers filled in", body: "Every answer Plato put on the form." },
        { target: '[data-tour="application-outcome"]', title: "Heard back?", body: "Mark it as viewed, interview, offer or rejected. Plato can't read your inbox, so this is how it learns." },
        { target: '[data-tour="application-steps"]', title: "Every step", body: "From queued to sent, with times." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => /^\/applications\/[^/]+$/.test(p) && s === "application.failed",
    tour: {
      id: "application-failed",
      name: "Application",
      steps: [
        { target: '[data-tour="application-hero"]', title: "It didn't go through", body: "Failed, closed by the employer, or skipped. The line under the title says why." },
        { target: '[data-ai="application.retry"]', title: "Try again", body: "Fix what the note says, then put it back in the queue." },
        { target: '[data-tour="application-confirmation"]', title: "What went wrong", body: "The reason Plato recorded and what the page showed." },
        { target: '[data-tour="application-proof"]', title: "What the page looked like", body: "A screenshot of the employer's page when it stopped, if one was saved." },
        { target: '[data-tour="application-steps"]', title: "Every step", body: "Shows how far it got before it stopped." },
        { target: '[data-tour="application-job"]', title: "The job", body: "Open the posting to apply yourself if you want to." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => /^\/applications\/[^/]+$/.test(p),
    tour: {
      id: "application",
      name: "Application",
      steps: [
        { target: 'nav[aria-label="Breadcrumb"]', title: "One application", body: "Applications takes you back to the list, on the same tab." },
        { target: '[data-tour="application-hero"]', title: "Where it stands", body: "The job, the company and one line on what is happening now." },
        { target: '[data-tour="application-stepper"]', title: "Stages", body: "From queued to sent. The highlighted one is now." },
        { target: '[data-tour="application-steps"]', title: "Live steps", body: "Each step shows here as it happens, with times." },
        { target: '[data-tour="application-sent"]', title: "What Plato prepared", body: "The resume and answers for this job, and the confirmation once it is sent." },
        { target: '[data-tour="application-job"]', title: "The job", body: "Location, salary, your match and the search it came from." },
        { target: '[data-ai="application.withdraw"]', title: "Changed your mind?", body: "Remove takes it off Plato's list. It asks you to confirm first." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ---------------------------------------------------------------- /following and /insights (same page)
  {
    match: (p, s) => (p === "/following" || p === "/insights") && s === "following.settings",
    tour: {
      id: "alerts-settings",
      name: "Alert settings",
      steps: [
        { target: '[data-tour="digest-settings"]', title: "Alert settings", body: "How many alerts are on, and what is waiting for your next digest." },
        { target: '[data-tour="digest-channels"]', title: "Where alerts arrive", body: "In Plato, by email, or both. Switch either off." },
        { target: '[data-tour="digest-cadence"]', title: "How often", body: "Daily, every three days or weekly. No new jobs, no digest." },
        { target: '[data-ai="following.settings"]', title: "Close it", body: "Alert settings opens and closes this panel." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => (p === "/following" || p === "/insights") && s === "following.empty",
    tour: {
      id: "alerts-empty",
      name: "Following",
      steps: [
        { target: '[data-tour="page-header"]', title: "Jobs come to you", body: "Follow companies and roles. Plato tells you when something new fits you." },
        { target: '[data-ai="following.company-search"]', title: "Follow a company", body: "Type a company name and press Follow. You hear when it posts a role that fits." },
        { target: '[data-ai="following.follow-role"]', title: "Follow a role", body: "Add a job title. New openings for it at any company come in your digest." },
        { target: '[data-ai="following.settings"]', title: "How often", body: "Alert settings picks daily, every three days or weekly, and in Plato or by email." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p) => p === "/insights" || p === "/following",
    tour: {
      id: "alerts",
      name: "Following",
      steps: [
        { target: '[data-tour="page-header"]', title: "Jobs come to you", body: "Plato watches what you follow and sends one digest on your schedule. Never an empty one." },
        { target: '[data-tour="following-status"]', title: "At a glance", body: "How many companies and roles you watch, how often, and where alerts arrive." },
        { target: '[data-tour="following-new"]', title: "New roles", body: "Fresh jobs from companies you follow. View opens the posting; Apply sends it to the extension." },
        { target: '[data-tour="following-companies"]', title: "Companies you follow", body: "See roles lists their jobs. The bell pauses alerts; the cross unfollows." },
        { target: '[data-tour="following-roles"]', title: "Roles you follow", body: "Follow a role adds a job title. The switch pauses it without deleting it." },
        { target: '[data-ai="following.company-search"]', title: "Follow more", body: "Search any company and follow it." },
        { target: '[data-tour="following-digests"]', title: "Past digests", body: "Every digest Plato sent you. Open one to see its jobs." },
        { target: '[data-ai="following.settings"]', title: "Alert settings", body: "How often digests arrive, and in Plato or by email." },
        ...SHELL.slice(2),
      ],
    },
  },

  // ---------------------------------------------------------------- /notifications
  {
    match: (p, s) => p === "/notifications" && s === "notifications.empty",
    tour: {
      id: "notifications-empty",
      name: "Notifications",
      steps: [
        { target: '[data-tour="page-header"]', title: "What changed", body: "Searches that finished, applications that moved and new jobs from your alerts. Nothing yet." },
        { target: '[data-tour="notifications-list"]', title: "They land here", body: "Start a search or apply to a few jobs. Updates arrive live; there is nothing to refresh." },
        { target: '[role="tablist"][aria-label="Filter notifications"]', title: "Filter", body: "All, Unread, Applications, Searches or Job alerts." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/notifications",
    tour: {
      id: "notifications",
      name: "Notifications",
      steps: [
        { target: '[data-tour="page-header"]', title: "What changed", body: "Searches that finished, applications that moved and new jobs from your alerts. Updates arrive live." },
        { target: '[role="tablist"][aria-label="Filter notifications"]', title: "Filter", body: "All, Unread, Applications, Searches or Job alerts." },
        { target: '[data-ai^="notifications.item:"]', title: "Go straight there", body: "Click one to open what it is about. Unread ones have a blue bar." },
        { target: '[data-ai="notifications.mark-all-read"]', title: "Clear the badge", body: "Mark everything as read." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ---------------------------------------------------------------- /extension
  {
    match: (p, s) => p === "/extension" && s === "extension.code",
    tour: {
      id: "extension-code",
      name: "Extension",
      steps: [
        { target: '[data-ai="extension.code"]', title: "Your code", body: "Type this into the Plato extension's side panel and press Link this browser." },
        { target: '[data-ai="extension.copy"]', title: "Copy it", body: "Copies the code so you can paste it." },
        { target: '[data-tour="extension-countdown"]', title: "Two minutes, one use", body: "When the extension uses it, this page moves on by itself." },
        { target: '[data-tour="extension-steps"]', title: "The steps", body: "Open the extension in Chrome, type the code, press Link this browser." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/extension" && s === "extension.linked",
    tour: {
      id: "extension-linked",
      name: "Extension",
      steps: [
        { target: '[data-tour="page-header"]', title: "Plato applies in your browser", body: "The extension fills application forms in your own Chrome and presses Submit once per job. You can watch every tab." },
        { target: '[data-tour="extension-devices"]', title: "Linked browsers", body: "Each browser signed in to your account, when it was linked and last used. Unlink signs it out." },
        { target: '[data-tour="extension-searches"]', title: "Feature a search", body: "Ticked searches show first in the extension, so you can pick them fast." },
        { target: '[data-ai="extension.generate"]', title: "Another browser", body: "Link another browser makes a new code." },
        { target: '[data-ai="nav.extension-progress"]', title: "Always visible", body: "This shows what the extension is doing. Click it for every job it is working on." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/extension",
    tour: {
      id: "extension",
      name: "Extension",
      steps: [
        { target: '[data-tour="page-header"]', title: "Plato applies in your browser", body: "The extension fills application forms in your own Chrome and presses Submit once per job. You can watch every tab." },
        { target: '[data-ai="extension.generate"]', title: "Link it once", body: "Generate a code, then type it into the extension's side panel." },
        { target: '[data-tour="extension-steps"]', title: "How linking works", body: "Open the extension, type the code, press Link this browser. The code works once and expires in two minutes." },
        { target: '[data-tour="extension-searches"]', title: "Feature a search", body: "Ticked searches show first in the extension." },
        { target: '[data-tour="extension-devices"]', title: "Linked browsers", body: "No browser is linked yet. Once one is, it shows here." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ---------------------------------------------------------------- /tokens (one screen)
  {
    match: (p) => p === "/tokens",
    tour: {
      id: "tokens",
      name: "Plan & credits",
      steps: [
        { target: '[data-tour="page-header"]', title: "One balance", body: "Searches, resumes and interviews use tokens. Applying is always free." },
        { target: '[data-ai="tokens.balance"]', title: "Where you stand", body: "What is left this month, and what that is enough for." },
        { target: '[data-tour="tokens-spending"]', title: "Where your tokens went", body: "This month's spending by the kind of work Plato did." },
        { target: "#plans", title: "Plans", body: "More tokens every month. Ask the Plato team to switch you; it applies as soon as they do." },
        { target: "#top-ups", title: "Top-ups", body: "One-time packs that never expire." },
        { target: '[data-tour="tokens-history"]', title: "History", body: "Every charge, refill and top-up. Filter by spent or added." },
        { target: '[data-tour="tokens-faq"]', title: "Questions", body: "Short answers about tokens, plans and refills." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ---------------------------------------------------------------- /profile (one tour per tab)
  {
    match: (p, s) => p === "/profile" && s === "profile.experience",
    tour: {
      id: "profile-experience",
      name: "Profile: experience & skills",
      steps: [
        { target: '[role="tablist"][aria-label="Profile"]', title: "Experience & skills", body: "What Plato read from your CV, plus what you add here. Resumes only use what is true." },
        { target: '[data-tour="profile-cv"]', title: "Your experience", body: "Your jobs as Plato read them from your CV. Edit changes them right here; so do the cards for education, languages and skills." },
        { target: '[data-tour="profile-projects"]', title: "Projects", body: "Real things you built. Especially useful early in your career." },
        { target: '[data-ai="profile.add-project"]', title: "Add a project", body: "Fill in the name and what you built, then press Add project." },
        { target: '[data-tour="profile-results"]', title: "Results", body: "What changed because of your work. A real number makes a bullet much stronger." },
        { target: '[data-tour="profile-skill-proof"]', title: "Skills with proof", body: "A skill with proof can go on a resume even if your CV never listed it." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/profile" && s === "profile.looking",
    tour: {
      id: "profile-looking",
      name: "Profile: what I'm looking for",
      steps: [
        { target: '[role="tablist"][aria-label="Profile"]', title: "What I'm looking for", body: "The jobs you want. Plato searches and ranks with these." },
        { target: '[data-tour="profile-looking"]', title: "Your targets", body: "Roles, locations, work setup, job type, experience, salary, industries and things to avoid." },
        { target: '[data-tour="profile-looking-edit"]', title: "Change them", body: "Edit opens the setup form with these answers filled in." },
        { target: '[data-tour="profile-suggests"]', title: "Plato suggests", body: "Up to three changes from your own data that would get you more interviews." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/profile" && s === "profile.answers",
    tour: {
      id: "profile-answers",
      name: "Profile: application answers",
      steps: [
        { target: '[role="tablist"][aria-label="Profile"]', title: "Application answers", body: "The questions forms ask again and again. You answer once." },
        { target: '[data-tour="profile-answers"]', title: "Your answers", body: "Notice period, visa, relocation and the rest. Empty ones are asked the first time a form needs them." },
        { target: '[data-tour="profile-answers-edit"]', title: "Change them", body: "Edit opens the form with your answers filled in." },
        { target: '[data-tour="profile-suggests"]', title: "Plato suggests", body: "Answers forms often need that you haven't given yet." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/profile" && s === "profile.documents",
    tour: {
      id: "profile-documents",
      name: "Profile: documents & browser",
      steps: [
        { target: '[role="tablist"][aria-label="Profile"]', title: "Documents & browser", body: "Your files and the Chrome extension." },
        { target: '[data-tour="profile-documents"]', title: "Documents", body: "Your CV, certificates, permits and more. A tick means Plato has read it." },
        { target: '[data-tour="profile-add-documents"]', title: "Add more", body: "Upload another document. Plato attaches the right one when a form asks." },
        { target: '[data-tour="profile-extension"]', title: "Plato Apply in Chrome", body: "Whether a browser is linked. The button opens the extension page." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/profile",
    tour: {
      id: "profile",
      name: "Profile",
      steps: [
        { target: '[data-tour="page-header"]', title: "What Plato knows about you", body: "It uses this to write resumes and fill applications. The more it knows, the fewer questions it asks." },
        { target: '[data-tour="profile-strength"]', title: "Profile strength", body: "How ready Plato is to apply without asking. The link is the next thing to add." },
        { target: '[role="tablist"][aria-label="Profile"]', title: "Everything in tabs", body: "Resumes, experience and skills, what you're looking for, the answers forms ask, and your documents." },
        { target: '[data-tour="profile-master"]', title: "Your master resume", body: "The CV you uploaded, scored out of 100. Every tailored version starts from it." },
        { target: '[data-tour="profile-tailored"]', title: "Tailored by Plato", body: "One version per job you tailored for. Preview it or get the PDF." },
        { target: '[data-tour="profile-upload"]', title: "Upload", body: "Replace your CV with a newer one." },
        { target: '[data-tour="profile-suggests"]', title: "Plato suggests", body: "Up to three changes from your own data that would get you more interviews." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ───────── Interviews (list, setup stepper, voice call, run, result)
  // ---------------- /career/interviews ----------------
  {
    match: (p: string, s: string | null) => p === "/career/interviews" && s === "interviews.empty",
    tour: {
      id: "interviews-empty",
      name: "Interviews",
      steps: [
        { target: '[role="tablist"][aria-label="Career"]', title: "Every part of Career", body: "Overview, quizzes, interviews, proof of skills, your skills gap, snapshot and the practice library are one click apart." },
        { target: '[data-tour="interviews-start"]', title: "Start here", body: "You have no interviews yet. Practise an interview asks a few quick questions (the job or role, out loud or in writing, real or coached), then takes you into the interview." },
        { target: '[data-ai="interviews.new"]', title: "Practise an interview", body: "Opens the setup. Nothing is charged until you press Start on the last screen." },
        { target: '[data-tour="interviews-stats"]', title: "Your progress", body: "Interviews done, finished, average and best score. It fills in after your first one." },
        { target: '[data-tour="interviews-history"]', title: "Your interviews", body: "Every interview you do lands here, newest first, with its score." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews" && s === "interviews.history",
    tour: {
      id: "interviews-history",
      name: "Interviews",
      steps: [
        { target: '[role="tablist"][aria-label="Career"]', title: "Every part of Career", body: "Overview, quizzes, interviews, proof of skills, your skills gap, snapshot and the practice library are one click apart." },
        { target: '[data-ai="interviews.new"]', title: "Practise again", body: "Opens the setup for a new interview: a job, a role or a tough situation." },
        { target: '[data-tour="interviews-continue"]', title: "Pick up where you left off", body: "Written interviews you started and didn't finish. Continue opens the question you stopped at." },
        { target: '[data-tour="interviews-stats"]', title: "Your progress", body: "How many you did, how many you finished, your average and your best score." },
        { target: '[data-tour="interviews-trend"]', title: "Your trend", body: "Your scores over time, once you have finished two or more." },
        { target: '[data-tour="interviews-history"]', title: "Every interview in one list", body: "Newest first, marked Chat or Voice and Real or Coach. Not finished ones say so." },
        { target: '[data-ai^="interviews.row:"], [data-ai^="career.result:"]', title: "Open one", body: "See each answer with its feedback, or continue an unfinished one." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    // Default (while the list is loading): same as before.
    match: (p: string) => p === "/career/interviews",
    tour: {
      id: "interviews",
      name: "Interviews",
      steps: [
        { target: '[role="tablist"][aria-label="Career"]', title: "Every part of Career", body: "Overview, quizzes, interviews, proof of skills, your skills gap, snapshot and the practice library are one click apart." },
        { target: '[data-tour="interviews-start"]', title: "One way in", body: "Practise an interview asks a few quick questions (the job or role, out loud or in writing, real or coached) and takes you straight into the interview." },
        { target: '[data-tour="interviews-continue"]', title: "Pick up where you left off", body: "Written interviews you started and didn't finish." },
        { target: '[data-tour="interviews-stats"]', title: "Your progress", body: "How many you did, how many you finished, your average and best score, and your trend." },
        { target: '[data-tour="interviews-history"]', title: "Every interview in one list", body: "Newest first, marked Chat or Voice and Real or Coach. Open one to see each answer and its feedback." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ---------------- /career/interviews/new (the setup stepper) ----------------
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.target",
    tour: {
      id: "interview-new-target",
      name: "Interview practice: what",
      steps: [
        { title: "One question at a time", body: "The setup asks five quick questions, shows a summary with the cost, then starts the interview. Answers are kept in the link, so Back and refresh work." },
        STEPS_BAR,
        { target: '[data-tour="interview-options"]', title: "What are you preparing for?", body: "A job you're applying to (questions from its posting and your CV), general practice for a role, or a specific situation like a salary talk. Click one, or press 1 to 3." },
        { target: '[data-ai="interview.new.target.job"]', title: "A job you're applying to", body: "Next you pick the job from your matches, saved or applied jobs, or paste a job post." },
        { target: '[data-ai="interview.new.target.situation"]', title: "A specific situation", body: "Salary negotiation, a case interview, presenting a solution or business English. Plato plays the other side." },
        { target: '[data-ai="interview.new.back"]', title: "Back", body: "On this first question, Back returns to Interviews." },
        NEXT_CHOICE,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.job",
    tour: {
      id: "interview-new-job",
      name: "Interview practice: job",
      steps: [
        STEPS_BAR,
        { target: '[data-ai="interview.new.search"]', title: "Find the job", body: "Search your jobs by title or company." },
        { target: '[role="tablist"][aria-label="Which jobs"]', title: "Which list", body: "Your matches, the jobs you saved, or the ones you applied to." },
        { target: '[data-tour="interview-job-list"]', title: "Pick one", body: "Click a job to choose it and move on. Show more loads more of the list." },
        { target: '[data-ai="interview.new.paste"]', title: "Not in your list?", body: "Paste the job post instead. Plato reads it and asks what that employer would ask." },
        BACK,
        { target: '[data-ai="interview.new.next"]', title: "Next", body: "Shows when a job is already chosen. Keep it, or click another job." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.paste",
    tour: {
      id: "interview-new-paste",
      name: "Interview practice: paste a job",
      steps: [
        STEPS_BAR,
        { target: '[data-ai="interview.new.paste.title"]', title: "Job title", body: "Needed. The company is optional." },
        { target: '[data-ai="interview.new.paste.text"]', title: "The job post", body: "Paste the description, at least 30 words. The counter under it turns green when it's enough. It stays in this browser tab only." },
        { target: '[data-ai="interview.new.back"]', title: "Back to your job list", body: "Returns to the list of your jobs." },
        { target: '[data-ai="interview.new.next"]', title: "Next", body: "Works once there is a title and 30 words." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.round",
    tour: {
      id: "interview-new-round",
      name: "Interview practice: round",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-options"]', title: "Which round is next?", body: "Each round asks different questions. Pick the one you have coming up. Click it, or press 1 to 3." },
        { target: '[data-ai="interview.new.round.screen"]', title: "First call with a recruiter", body: "Why this job, your motivation, salary and the basics." },
        { target: '[data-ai="interview.new.round.manager"]', title: "Hiring manager", body: "Your experience and skills against what the job needs." },
        { target: '[data-ai="interview.new.round.loop"]', title: "All rounds", body: "Every round in one sitting." },
        BACK,
        NEXT_CHOICE,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.role.general",
    tour: {
      id: "interview-new-role-general",
      name: "Interview practice: role",
      steps: [
        STEPS_BAR,
        { target: '[data-ai="interview.new.role"]', title: "The role", body: "The questions fit this role and what's on your CV. It starts with the role you are looking for." },
        { target: '[data-tour="interview-role-chips"]', title: "Your roles", body: "The roles from your preferences. Click one to use it." },
        { target: '[data-ai="interview.new.skill"]', title: "Main skill (optional)", body: "Used for the technical questions. Leave it empty and Plato picks from your CV." },
        { target: '[data-ai="interview.new.notes"]', title: "Anything we should know? (optional)", body: "Level, company type, topics you expect, or a job ad. Plato uses it to pick the topics and the level." },
        BACK,
        { target: '[data-ai="interview.new.next"]', title: "Next", body: "Works once the role has a name. Enter in the role box does the same." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.role.situation",
    tour: {
      id: "interview-new-role-situation",
      name: "Interview practice: role",
      steps: [
        STEPS_BAR,
        { target: '[data-ai="interview.new.role"]', title: "Your role or field", body: "So the recruiter, client or interviewer Plato plays fits your world." },
        { target: '[data-tour="interview-role-chips"]', title: "Your roles", body: "The roles from your preferences. Click one to use it." },
        { target: '[data-ai="interview.new.notes"]', title: "Anything we should know? (optional)", body: "The offer you expect, the client or company type, or what you want to practise." },
        BACK,
        { target: '[data-ai="interview.new.next"]', title: "Next", body: "Works once the role has a name. Enter in the role box does the same." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.focus",
    tour: {
      id: "interview-new-focus",
      name: "Interview practice: questions",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-options"]', title: "What kind of questions?", body: "Click one, or press 1 to 4." },
        { target: '[data-ai="interview.new.focus.mixed"]', title: "Mixed", body: "A bit of everything, like a first-round interview." },
        { target: '[data-ai="interview.new.focus.behavioral"]', title: "Behavioral", body: "\"Tell me about a time…\" questions, judged on structure and results (STAR)." },
        { target: '[data-ai="interview.new.focus.technical"]', title: "Technical", body: "Your skills and how you work, built from your CV." },
        { target: '[data-ai="interview.new.focus.situational"]', title: "Situational", body: "\"What would you do if…\" judgement questions." },
        BACK,
        NEXT_CHOICE,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.format",
    tour: {
      id: "interview-new-format",
      name: "Interview practice: situation",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-options"]', title: "Which situation?", body: "Plato plays the other side and judges how you handle it. Click one, or press 1 to 4." },
        { target: '[data-ai="interview.new.format.negotiation"]', title: "Salary negotiation", body: "Ask for more against a tough recruiter." },
        { target: '[data-ai="interview.new.format.case"]', title: "Case interview", body: "Size a market or find why profits fell, thinking out loud." },
        { target: '[data-ai="interview.new.format.pitch"]', title: "Presenting a solution", body: "Pitch to a skeptical client who pushes back." },
        { target: '[data-ai="interview.new.format.english"]', title: "Business English", body: "Interview answers in English, with gentle corrections." },
        BACK,
        NEXT_CHOICE,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.how",
    tour: {
      id: "interview-new-how",
      name: "Interview practice: how",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-options"]', title: "How do you want to answer?", body: "Both are scored the same way and end with the same result. Click one, or press 1 or 2." },
        { target: '[data-ai="interview.new.how.voice"]', title: "Out loud", body: "A live voice call with Plato on this page, closest to the real thing. Charged by the minute." },
        { target: '[data-ai="interview.new.how.chat"]', title: "In writing", body: "Type your answers one question at a time, at your pace. Charged per question." },
        BACK,
        NEXT_CHOICE,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.style",
    tour: {
      id: "interview-new-style",
      name: "Interview practice: style",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-options"]', title: "How should Plato treat you?", body: "You can pick differently next time. Click one, or press 1 or 2." },
        { target: '[data-ai="interview.new.style.real"]', title: "Like the real interview", body: "No hints along the way. Your scorecard at the end." },
        { target: '[data-ai="interview.new.style.coach"]', title: "Coach me", body: "Feedback after every answer: what worked and one thing to sharpen." },
        BACK,
        NEXT_CHOICE,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.ready",
    tour: {
      id: "interview-new-ready",
      name: "Interview practice: ready",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-summary"]', title: "Your interview", body: "What you chose: the job, role or situation, how you answer and the style." },
        { target: '[data-ai^="interview.new.edit:"]', title: "Change an answer", body: "Change opens that question again. You come back here after." },
        { target: '[data-tour="interview-length"]', title: "How long", body: "How many questions and roughly how many minutes." },
        { target: '[data-tour="interview-cost"]', title: "What it costs", body: "The Plato tokens it uses and what you have. A voice call is charged only for the minutes you use." },
        { target: '[data-ai="interview.new.tokens"]', title: "Not enough tokens", body: "Shows when your balance is too low. Get more tokens, or wait for the refill date." },
        { target: '[data-ai="interview.new.start"]', title: "Start when ready", body: "Nothing is charged until you press Start. A written interview opens on its own page; a call starts right here and asks for your microphone." },
        BACK,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.call",
    tour: {
      id: "interview-new-call",
      name: "Voice interview",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-run-header"]', title: "The interview", body: "What you are practising, Voice, Real or Coach, and which question you are on." },
        { target: '[data-tour="interview-call-timer"]', title: "Time on the call", body: "Minutes used so far. You pay only for these." },
        { target: '[data-tour="voice-time"]', title: "Time left", body: "How much of the call your balance allows. It turns amber near the end, and the call ends on its own at the limit." },
        { target: '[data-tour="voice-turn"]', title: "Whose turn", body: "Plato speaking, or your turn. Talk anytime to interrupt, or say \"repeat that\"." },
        { target: '[data-tour="voice-transcript"]', title: "The conversation", body: "Everything said so far, written out as it happens." },
        { target: '[data-ai="interview.call.mute"]', title: "Mute", body: "Stops Plato hearing you. Unmute to answer." },
        { target: '[data-ai="interview.call.end"]', title: "End call", body: "Ends the call and writes your scorecard. It opens as your result." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/career/interviews/new" && s === "interview-new.call-unscored",
    tour: {
      id: "interview-new-call-unscored",
      name: "Voice interview",
      steps: [
        { target: '[data-tour-state="interview-new.call-unscored"]', title: "No scorecard this time", body: "The call was too short to judge, ended before you answered, or the scorecard couldn't be written. Only the minutes you were on the call were charged." },
        { target: '[data-ai="interview.call.again"]', title: "Try again", body: "Back to the summary to start a new call with the same setup." },
        { target: '[data-ai="interview.back"]', title: "Back to Interviews", body: "Your list of interviews." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    // Default (e.g. the short skeleton while a pasted job post loads).
    match: (p: string) => p === "/career/interviews/new",
    tour: {
      id: "interview-flow",
      name: "Interview practice",
      steps: [
        { title: "One question at a time", body: "Answer each screen and Plato moves on. Back takes you to the previous question; links that already know the answer skip it." },
        STEPS_BAR,
        { target: '[data-ai="interview.new.start"]', title: "Start when ready", body: "The summary shows the cost before anything is charged. Nothing starts until you press Start." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ---------------- /career/interviews/<id> (a written interview) ----------------
  {
    match: (p: string, s: string | null) => isInterviewId(p) && s === "interview.run.real",
    tour: {
      id: "interview-run-real",
      name: "Interview",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-run-header"]', title: "The interview", body: "What you are practising, Chat and Real, and the question you are on out of how many." },
        { target: '[data-tour="interview-conversation"]', title: "So far", body: "The questions and your answers up to now." },
        { target: '[data-tour="interview-turn"]', title: "Your turn", body: "The question to answer now. If an answer is vague, the interviewer asks one follow-up, scored with it." },
        { target: '[data-ai="interview.answer"]', title: "Your answer", body: "Answer as you would out loud: what you did, how, and the result. At least 10 words." },
        { target: '[data-ai="interview.send"]', title: "Send answer", body: "Or press Ctrl+Enter. No feedback until the end; after the last answer you get your scorecard." },
        { target: '[data-ai="interview.later"]', title: "Finish later", body: "Your answers are saved. Continue from Interviews." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => isInterviewId(p) && s === "interview.run.coach",
    tour: {
      id: "interview-run-coach",
      name: "Interview (coach)",
      steps: [
        STEPS_BAR,
        { target: '[data-tour="interview-run-header"]', title: "The interview", body: "What you are practising, Chat and Coach, and the question you are on out of how many." },
        { target: '[data-tour="interview-feedback"]', title: "Coach feedback", body: "Under each answer: a score out of 5, what worked, and a stronger way to say it." },
        { target: '[data-tour="interview-turn"]', title: "Your turn", body: "The question to answer now. If an answer is vague, the interviewer asks one follow-up, scored with it." },
        { target: '[data-ai="interview.answer"]', title: "Your answer", body: "Answer as you would out loud: what you did, how, and the result. At least 10 words." },
        { target: '[data-ai="interview.send"]', title: "Send answer", body: "Or press Ctrl+Enter. The coach reads it and replies before the next question." },
        { target: '[data-ai="interview.later"]', title: "Finish later", body: "Your answers are saved. Continue from Interviews." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p: string, s: string | null) => isInterviewId(p) && s === "interview.result",
    tour: {
      id: "interview-result",
      name: "Interview result",
      steps: [
        { target: '[data-tour="results-score"]', title: "Your score", body: "Out of 100, what it means, and your communication score." },
        { target: '[data-tour="results-feedback"]', title: "Went well, work on", body: "The strengths to keep and the gaps to fix first." },
        { target: '[data-tour="results-items"]', title: "Answer by answer", body: "Each question with its score. Open one to see your answer and a stronger way to say it." },
        { target: '[data-tour="results-next"]', title: "Your next step", body: "The one thing to do next." },
        { target: '[data-ai="interview.again"]', title: "Practise again", body: "The same interview again, opened on the summary so you can change anything first." },
        { target: '[data-ai="interview.back"]', title: "Back to Interviews", body: "Your list of interviews and your progress." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    // Default (loading, or "couldn't be opened").
    match: (p: string) => isInterviewId(p),
    tour: {
      id: "interview",
      name: "Interview",
      steps: [
        { target: '[role="progressbar"]', title: "How far you are", body: "The question you are on and how many are left." },
        { target: '[data-ai="interview.answer"]', title: "Answer the question", body: "Type your answer. Plato follows up like a real interviewer; in Coach style you get feedback after every answer." },
        { target: '[data-ai="interview.later"]', title: "Finish later", body: "Your answers are saved. Continue from Interviews." },
        { target: '[data-ai="interview.again"]', title: "Practise again", body: "Once finished, run the same interview again from the summary." },
        { target: '[data-ai="interview.back"]', title: "Back to Interviews", body: "Your list of interviews." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  // ───────── Career
  // ───────────── /career ─────────────
  {
    match: (p) => p === "/career",
    tour: {
      id: "career",
      name: "Career",
      steps: [
        { target: '[data-tour="career-overview"]', title: "How ready you are", body: "Your readiness for your first preferred role, and the four things employers look at. Click one to work on it." },
        { target: '[data-tour="career-catalog"]', title: "Every test and practice", body: "Interviews, aptitude tests, skills, business English and resume work. Pick a category or search, then Start." },
        { target: '[data-tour="career-prep"]', title: "Prep for an interview", body: "Pick one of your jobs, or paste any job post. Plato builds the interview from it." },
        { target: '[data-tour="career-continue"]', title: "Pick up where you left off", body: "Unfinished interviews, challenge drafts and coach chats. Resume opens them where you stopped." },
        { target: '[data-tour="career-recommendations"]', title: "What to do next", body: "Ranked by how much each step raises your readiness. Start the top one." },
        CAREER_TABS,
        ...SHELL.slice(2),
      ],
    },
  },

  // ───────────── /career/snapshot ─────────────
  {
    match: (p) => p === "/career/snapshot",
    tour: {
      id: "career-snapshot",
      name: "Profile snapshot",
      steps: [
        { target: '[data-tour="snapshot-readiness"]', title: "Your readiness", body: "Your stage and a 0 to 100 readiness score, built from the four bars beside it." },
        { target: '[data-tour="snapshot-skills"]', title: "Every skill and its proof", body: "Skills from your CV and your matches, with their status and level. Assess or Prove it on any row." },
        { target: '[data-tour="snapshot-strengths"]', title: "Strengths and what to work on", body: "Taken from your scores, your resume and the skills your matches ask for." },
        { target: '[data-tour="snapshot-recommendations"]', title: "Everything Plato suggests", body: "All recommended next steps, most valuable first." },
        { target: '[data-tour="snapshot-history"]', title: "Your history", body: "Every scored activity, newest first, with your trend. Open one for its report." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ───────────── /career/results/[id] ─────────────
  {
    match: (p, s) => /^\/career\/results\/[^/]+$/.test(p) && s === "result.assessment",
    tour: {
      id: "career-result-assessment",
      name: "Assessment result",
      steps: [
        { target: '[data-tour="results-score"]', title: "Your level", body: "Your score, your level and what it means. 65 or more counts as proven. If you rated yourself, it shows how close you were." },
        { target: '[data-tour="results-feedback"]', title: "Went well, to work on", body: "The topics you did well in and the ones to review." },
        { target: '[data-tour="results-items"]', title: "Every question, explained", body: "Each question with the right answer and why. Click one to see the answer you picked." },
        { target: '[data-tour="results-next"]', title: "Do next", body: "The steps that raise your readiness most from here." },
        { target: '[data-tour="results-snapshot"]', title: "Your snapshot moved", body: "Your readiness and this skill's level before and after this result." },
        { target: '[data-ai="result.retry"]', title: "Try again", body: "Retake it any time. Your snapshot uses the latest score." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => /^\/career\/results\/[^/]+$/.test(p) && s === "result.proof",
    tour: {
      id: "career-result-proof",
      name: "Challenge result",
      steps: [
        { target: '[data-tour="results-score"]', title: "Your score", body: "70 or more passes and counts as proof of work. The bars show rubric and depth." },
        { target: '[data-tour="results-items"]', title: "The rubric", body: "Each rubric point, covered or missed, with what to add." },
        { target: '[data-tour="results-submission"]', title: "Your submission", body: "Open it to read what you sent." },
        { target: '[data-tour="results-next"]', title: "Do next", body: "The steps that raise your readiness most from here." },
        { target: '[data-tour="results-snapshot"]', title: "Your snapshot moved", body: "Your readiness and proof of work before and after this result." },
        { target: '[data-ai="result.retry"]', title: "Try again", body: "Opens the same challenge to write a better answer." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => /^\/career\/results\/[^/]+$/.test(p) && s === "result.interview",
    tour: {
      id: "career-result-interview",
      name: "Interview result",
      steps: [
        { target: '[data-tour="results-score"]', title: "Your score", body: "Out of 100, with what it means. 75 or more holds up in a real interview." },
        { target: '[data-tour="results-items"]', title: "Answer by answer", body: "Click an answer to read it again with its feedback and a stronger way to say it." },
        { target: '[data-tour="results-next"]', title: "Your next step", body: "The one thing to work on before your next round." },
        { target: '[data-ai="interview.again"]', title: "Practise again", body: "Runs the same interview again while the feedback is fresh." },
        { target: '[data-ai="interview.snapshot"]', title: "Your snapshot", body: "See how this changed your readiness." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => /^\/career\/results\/[^/]+$/.test(p) && s === "result.missing",
    tour: {
      id: "career-result-missing",
      name: "Result",
      steps: [
        { title: "This result isn't here", body: "Assessment, challenge and voice interview scores are saved in the browser you took them in. Open it there, or take the practice again." },
        { target: '[data-ai="result.back"]', title: "Back to Career", body: "Your overview, with every result saved on this device." },
        CAREER_TABS,
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => /^\/career\/results\/[^/]+$/.test(p),
    tour: {
      id: "career-result",
      name: "Result",
      steps: [
        { target: '[data-tour="results-score"]', title: "Your score", body: "What it means for your profile, and the breakdown behind it." },
        { target: '[data-tour="results-items"]', title: "Item by item", body: "Open an item to see your answer and the feedback." },
        { target: '[data-tour="results-next"]', title: "Do next", body: "The step that raises your readiness most from here." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ───────────── /career/quizzes ─────────────
  {
    match: (p) => p === "/career/quizzes",
    tour: {
      id: "quizzes",
      name: "Quizzes",
      steps: [
        CAREER_TABS,
        { target: '[data-tour="quizzes-builder"]', title: "Build a quiz for any job", body: "Pick one of your jobs or paste a description. Plato researches how the company tests candidates and writes a quiz in that format." },
        { target: '[data-tour="quizzes-mine"]', title: "Your quizzes", body: "Every quiz you built, with your best score. Start, retake, or delete one from its menu." },
        { target: '[data-tour="quizzes-library"]', title: "From the library", body: "Quizzes other seekers built, ready to take now. Search by company or role." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ───────────── /career/proof ─────────────
  {
    match: (p) => p === "/career/proof",
    tour: {
      id: "proof",
      name: "Proof of skills",
      steps: [
        CAREER_TABS,
        { target: '[data-tour="proof-intro"]', title: "Real work samples", body: "Write it, check it against the rubric, then submit. 70 or more passes and raises your readiness." },
        { target: '[data-tour="proof-cv"]', title: "From your CV", body: "Challenges for skills you already list, so they show as proven." },
        { target: '[data-tour="proof-gaps"]', title: "Close your skill gaps", body: "Skills your matches ask for that your CV doesn't show." },
        { target: '[data-ai^="proof.open:"]', title: "Open one", body: "Each card shows its time and level, and Draft saved or your score if you started it." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ───────────── /career/proof/[id] ─────────────
  {
    match: (p) => /^\/career\/proof\/[^/]+$/.test(p),
    tour: {
      id: "proof-workspace",
      name: "Challenge",
      steps: [
        { target: '[data-tour="proof-brief"]', title: "The brief", body: "What to do and what to hand in." },
        { target: '[data-tour="proof-rubric"]', title: "How it's scored", body: "The rubric points your answer must cover. Check my work ticks the ones your draft already covers." },
        { target: '[data-ai="proof.editor"]', title: "Write your answer", body: "It saves as a draft on this device while you type." },
        { target: '[data-tour="proof-words"]', title: "Length", body: "Depth is 20% of the score and is full at the target length." },
        { target: '[data-ai="proof.submit"]', title: "Submit for scoring", body: "Needs at least 10 words. Your result opens with the score and what was missing." },
        { target: '[data-ai="proof.exit"]', title: "Save and exit", body: "Your draft is kept. Continue it from the Career overview." },
        ...SHELL.slice(2, 3),
      ],
    },
  },

  // ───────────── /career/skills ─────────────
  {
    match: (p, s) => p === "/career/skills" && s === "skills.list",
    tour: {
      id: "skills-list",
      name: "Skills gap",
      steps: [
        { target: '[data-tour="page-header"]', title: "Skills your jobs want", body: "Taken from the jobs that match you best and missing from your profile." },
        { target: '[data-tour="skills-stats"]', title: "In numbers", body: "Skills to learn, jobs analysed, courses in progress and certificates verified on your profile." },
        { target: '[data-ai^="skills.row:"]', title: "Open a skill", body: "How many jobs ask for it and how many it would unlock. Click it for ways to learn it." },
        { target: '[data-tour="skills-courses"]', title: "Learn it or prove it", body: "Take the assessment or a challenge if you know it already. Otherwise pick a course, mark I'm taking it, then I finished it." },
        { target: '[data-tour="skills-credentials"]', title: "Your courses and certificates", body: "Add the certificate link and Plato checks it. Only a verified one is added to your profile." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p, s) => p === "/career/skills" && s === "skills.empty",
    tour: {
      id: "skills-empty",
      name: "Skills gap",
      steps: [
        { target: '[data-tour="page-header"]', title: "Skills your jobs want", body: "Plato compares the jobs that match you with your profile and lists what is missing." },
        { target: '[data-tour="skills-gap"]', title: "No gaps yet", body: "Either no jobs were analysed yet, or your profile already covers what they ask for." },
        { target: '[data-ai="skills.find-jobs"]', title: "Find jobs", body: "Run a search in Jobs. The gap fills in from your matches." },
        { target: '[data-tour="skills-credentials"]', title: "Your courses and certificates", body: "Courses you take and certificates you add show up here." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/career/skills",
    tour: {
      id: "skills",
      name: "Skills gap",
      steps: [
        CAREER_TABS,
        { target: '[data-tour="page-header"]', title: "Skills your jobs want", body: "Taken from the jobs that match you best. Learn one, paste the certificate link, and Plato verifies it before adding it." },
        { target: '[data-tour="skills-credentials"]', title: "Your courses and certificates", body: "Courses you take and certificates you add show up here." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  // ───────── Onboarding
  {
    match: (p: string, s: string | null) => p === "/onboarding" && s === "onboarding.documents",
    tour: {
      id: "onboarding-documents",
      name: "Documents",
      steps: [
        { target: '[data-tour="onboarding-progress"]', title: "Three short steps", body: "Documents, then Preferences, then Connect. This shows where you are." },
        { target: '[data-tour="onboarding-cv"]', title: "Start with your CV", body: "Upload a PDF or Word file. Plato reads it into your profile, and a short summary of what it read appears under it. Replace swaps in a newer CV." },
        { target: '[data-tour="onboarding-docs"]', title: "Other documents, if you have them", body: "Cover letter, certificates, visa, ID and more. Plato attaches the right one when a job asks for it. All optional." },
        { target: '[data-ai="onboarding.continue"]', title: "Continue to preferences", body: "Turns on once Plato has read your CV. Only the CV is needed." },
        { target: '[data-tour="plato-ai"]', title: "Questions? Ask Plato", body: "Open the chat to ask what to upload, how your data is used, or anything else about this step." },
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/onboarding" && s === "onboarding.preferences",
    tour: {
      id: "onboarding-preferences",
      name: "Preferences",
      steps: [
        { target: '[data-tour="onboarding-prefs-head"]', title: "Filled in from your CV", body: "Check what Plato guessed and change anything. The line under the title shows about how many open jobs match these settings." },
        { target: '[data-tour="onboarding-prefs-job"]', title: "What job", body: "Job titles, experience level, job type and work style. Plato searches for these titles and ranks jobs against them." },
        { target: '[data-tour="onboarding-prefs-where"]', title: "Where and for how much", body: "Cities or countries, your expected and minimum salary, and companies you'd love to work for. Plato tells you when those companies post a fitting role." },
        { target: '[data-tour="onboarding-prefs-answers"]', title: "Answers for your applications", body: "Notice period, visa, relocation and the other questions forms ask, plus things to avoid. Set them once so Plato never stops to ask." },
        { target: '[data-ai="onboarding.continue"]', title: "Save and continue", body: "Continue saves everything. Back returns to your documents. You can change all of this later in your profile." },
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/onboarding" && s === "onboarding.connect",
    tour: {
      id: "onboarding-connect",
      name: "Connect",
      steps: [
        { target: '[data-tour="onboarding-install"]', title: "Add Plato Apply to Chrome", body: "Plato applies through its free Chrome extension, in your own browser. This button opens the install page." },
        { target: '[data-tour="onboarding-pair"]', title: "Link it to your account", body: "Logged in here, it links itself once installed. Otherwise press Get my code and paste the code into the extension. A code works once and expires." },
        { target: '[data-ai="onboarding.finish"]', title: "Finish", body: "Continue takes you to Home. Back returns to your preferences." },
        { target: '[data-tour="onboarding-skip"]', title: "Not now?", body: "Skip for now and connect later from the Extension page. Plato can search and rank jobs without it, but cannot apply." },
      ],
    },
  },
  {
    match: (p: string, s: string | null) => p === "/onboarding" && s === "onboarding.connect-linked",
    tour: {
      id: "onboarding-connect-linked",
      name: "Connect",
      steps: [
        { target: '[data-tour="onboarding-pair"]', title: "Plato Apply is connected", body: "The extension in this browser is linked to your account. Plato can now apply for you." },
        { target: '[data-tour="onboarding-install"]', title: "On another computer?", body: "Install Plato Apply there too and it links itself when you are logged in." },
        { target: '[data-ai="onboarding.finish"]', title: "You're done", body: "Continue takes you to Home, where Plato starts finding jobs for you." },
      ],
    },
  },
  // Default: a step still loading (skeleton) or the preferences load error.
  {
    match: (p: string) => p === "/onboarding",
    tour: {
      id: "onboarding",
      name: "Onboarding",
      steps: [
        { title: "Set up Plato", body: "Three short steps: your documents, what job you want, and the Chrome extension that applies for you." },
        { target: '[data-tour="onboarding-progress"]', title: "Where you are", body: "The step you are on and how many are left." },
        { target: '[data-tour="plato-ai"]', title: "Questions? Ask Plato", body: "Open the chat for help with this step." },
      ],
    },
  },
]

export function tourFor(path: string, state: string | null = null): Tour {
  return TOURS.find((t) => t.match(path, state))?.tour ?? { id: `page:${path}`, name: "This page", steps: [{ target: '[data-tour="page-header"]', title: "This page", body: "The title and the line under it say what this page is for." }, ...SHELL] }
}
