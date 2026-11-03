// What the "Take a tour" button walks through, page by page. Each step points
// at an element by CSS selector (data-tour hooks, or the data-ai names the
// assistant already uses); a step whose element is not on screen right now is
// skipped, and a step without a target is shown in the middle of the screen.

export type TourStep = { target?: string; title: string; body: string }
export type Tour = { id: string; name: string; steps: TourStep[] }

// Shown at the end of every tour: the things that are the same on every page.
const SHELL: TourStep[] = [
  { target: '[data-tour="sidebar-nav"]', title: "Everything, in the order you use it", body: "Home shows where you stand. Find & apply is the job hunt itself. Grow is your career coach. Account holds the rest." },
  { target: '[data-tour="status-card"]', title: "What is running for you", body: "Whether the browser extension is online, and how many Plato tokens you have left this month. Click either for details." },
  { target: '[data-tour="plato-ai"]', title: "Ask Plato anything", body: "Plato AI can do what any button does: start a search, open a job, explain a page. Type it in your own words." },
  { target: '[data-tour="tour-button"]', title: "Lost? Start here again", body: "This button gives a tour of whatever page you are on." },
]

const TOURS: { match: (path: string) => boolean; tour: Tour }[] = [
  {
    match: (p) => p === "/",
    tour: {
      id: "home",
      name: "Home",
      steps: [
        { title: "Welcome to Plato", body: "Plato searches job boards for you, ranks every posting against your profile and applies in your own browser. Here is the quick way round." },
        { target: '[data-tour="page-header"]', title: "Your day in one line", body: "Under the greeting, Plato tells you the one thing worth knowing right now, like applications that need an answer." },
        { target: '[data-tour="next-steps"]', title: "Your next steps", body: "The path from sign-up to your first applications. The highlighted step is the one to do now; it ticks itself off when done." },
        { target: '[data-tour="home-kpis"]', title: "Your job hunt in numbers", body: "Jobs ready for you, applications, searches and postings analyzed, always up to date." },
        { target: '[data-tour="home-charts"]', title: "How it is going", body: "Your pipeline from found to applied, how well the jobs match you, and what Plato fetched in the last two weeks." },
        { target: '[data-tour="home-recent"]', title: "Pick up where you left off", body: "Your latest searches. Open one to see its ranked jobs." },
        { target: '[data-ai="home.new-search"]', title: "Start a search", body: "Tell Plato the role you want. It searches every board from the last 30 days." },
        ...SHELL,
      ],
    },
  },
  {
    match: (p) => p === "/jobs",
    tour: {
      id: "jobs",
      name: "Jobs",
      steps: [
        { target: '[data-tour="page-header"]', title: "All your searches", body: "Every search you ran lives here, one row each." },
        { target: '[data-ai="jobs.new-search"]', title: "Start a new one", body: "Opens a conversation: describe the role in your own words and Plato does the rest." },
        { target: '[data-tour="jobs-toolbar"]', title: "Find a search fast", body: "Search by name, role or location, limit to recent activity, and sort by what matters to you." },
        { target: '[data-tour="jobs-status"]', title: "Filter by status", body: "Searching is still running, Ready has ranked jobs, Failed can be run again." },
        { target: '[data-tour="jobs-table"]', title: "Open or peek", body: "Click a row to open the full results. Click the arrow at the start of a row to see its top 5 jobs right here, with Save and Apply." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p) => /^\/jobs\/[^/]+$/.test(p),
    tour: {
      id: "results",
      name: "Search results",
      steps: [
        { target: '[data-tour="page-header"]', title: "One search", body: "While it runs you see live progress. When it is done, every job is ranked against your profile, best first." },
        { target: '[data-tour="results-tabs"]', title: "Discover, saved, applied", body: "Discover is everything new. Saved is your shortlist. Applied is what Plato sent." },
        { target: '[data-ai="results.filters"]', title: "Narrow it down", body: "Location, job type, level, how recent, salary. Plato remembers them for this search." },
        { target: '[data-ai="results.save:1"]', title: "Save what you like", body: "The bookmark keeps a job on your shortlist." },
        { target: '[data-ai="results.mock-interview:1"]', title: "Practise for this job", body: "Starts a mock interview built from this posting." },
        { target: '[data-ai="results.apply-top"]', title: "Apply in one go", body: "Send the best matches to the browser extension. It fills each form; you press Submit." },
        { target: '[data-tour="chat-composer"], [data-ai="chat.input"]', title: "Talk to it", body: "Ask Plato to refine the search, compare jobs or explain a match." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p) => p === "/applications",
    tour: {
      id: "applications",
      name: "Applications",
      steps: [
        { target: '[data-tour="page-header"]', title: "Everything Plato applied to", body: "Each job you sent, with where it stands. It updates live." },
        { target: '[data-ai^="applications.tab."]', title: "Needs you first", body: "Filter by status. Anything that needs an answer or a human check is at the top." },
        { target: '[data-ai^="applications.row:"]', title: "Open one for the details", body: "See exactly what Plato sent, the employer's questions and a screenshot as proof." },
        { target: '[data-ai^="applications.retry:"]', title: "Try again", body: "When something went wrong on the employer's site, retry once you have fixed it." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p) => /^\/applications\/[^/]+$/.test(p),
    tour: {
      id: "application",
      name: "Application",
      steps: [
        { target: 'nav[aria-label="Breadcrumb"]', title: "One application", body: "The breadcrumb takes you back to all applications." },
        { target: "main h1, h1", title: "What, where and when", body: "The job, the company, when Plato applied and which search it came from." },
        { target: '[data-ai="application.retry"]', title: "If it did not go through", body: "Fix what the note says, then retry." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/insights",
    tour: {
      id: "alerts",
      name: "Job alerts",
      steps: [
        { target: '[data-tour="page-header"]', title: "Jobs come to you", body: "Plato watches for new jobs and sends one digest on your schedule. Never an empty one." },
        { target: '[data-ai="insights.field.title"]', title: "Follow a role", body: "Type a job title, optionally a location or remote only, and add it." },
        { target: '[data-ai="insights.company.search"]', title: "Follow a company", body: "Get told when a company you like posts something that fits you." },
        { target: '[data-ai^="insights.cadence."]', title: "How often", body: "Daily, every three days or weekly." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p) => p === "/career",
    tour: {
      id: "career",
      name: "Career",
      steps: [
        { target: '[data-tour="page-header"]', title: "Your career coach", body: "Build a resume from your profile, tailor it to a job, or ask for advice." },
        { target: '[data-ai^="career.start:"]', title: "Start from an idea", body: "Pick one to begin, or type your own." },
        { target: '[data-ai="career.voice"]', title: "Talk instead of typing", body: "A voice conversation, like a real call." },
        { target: '[data-tour="career-interviews"]', title: "Mock interviews", body: "Your practice interviews and their scores." },
        { target: '[data-tour="career-skills"]', title: "Skills gap", body: "What your best jobs ask for that your profile does not show yet, with ways to learn it." },
        ...SHELL.slice(2),
      ],
    },
  },
  {
    match: (p) => p === "/career/interviews" || /^\/career\/interviews\/[^/]+$/.test(p),
    tour: {
      id: "interviews",
      name: "Mock interviews",
      steps: [
        { target: 'nav[aria-label="Breadcrumb"]', title: "Part of Career", body: "The breadcrumb takes you back to your career coach." },
        { target: '[data-ai^="interviews.row:"]', title: "Your interviews", body: "Open one to see every answer and its feedback." },
        { target: '[data-ai="interview.answer"]', title: "Answer the question", body: "Type your answer. Plato follows up like a real interviewer, then scores you." },
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
        { target: 'nav[aria-label="Breadcrumb"]', title: "Part of Career", body: "The breadcrumb takes you back to your career coach." },
        { target: '[data-tour="page-header"]', title: "Skills your jobs want", body: "Taken from the jobs that match you best. Learn one, paste the certificate link, and Plato verifies it before adding it." },
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
        { target: '[data-tour="page-header"]', title: "Plato applies in your browser", body: "The extension fills application forms in your own Chrome. Nothing is ever submitted without you." },
        { target: '[data-ai="extension.generate"]', title: "Link it once", body: "Generate a code, then type it into the extension's side panel." },
        { target: '[data-ai="extension.code"]', title: "Your code", body: "Works once and expires in two minutes." },
        { target: '[data-tour="status-card"]', title: "Always visible", body: "Once linked, the sidebar shows whether the extension is online and what it is doing." },
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
        { target: '[data-tour="page-header"]', title: "What changed", body: "Searches that finished, applications that moved and new jobs from your alerts." },
        { target: '[data-ai^="notifications.filter."]', title: "Filter", body: "Show just one kind." },
        { target: '[data-ai^="notifications.item:"]', title: "Go straight there", body: "Click one to open what it is about." },
        { target: '[data-ai="notifications.mark-all-read"]', title: "Clear the badge", body: "Mark everything as read." },
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
        { target: '[data-ai="profile.edit-details"]', title: "Your details", body: "Contact info, work rights, salary and notice period: the answers forms ask for." },
        { target: '[data-ai="profile.add-project"]', title: "Add projects and results", body: "Real things you built and achieved make your resumes stronger, especially early in your career." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
  {
    match: (p) => p === "/tokens",
    tour: {
      id: "tokens",
      name: "Plato tokens",
      steps: [
        { target: '[data-tour="page-header"]', title: "One balance", body: "Searches, resumes and interviews use tokens. Applying is always free." },
        { target: '[data-ai="tokens.balance"]', title: "Where you stand", body: "What is left this month, and what that is enough for." },
        { target: '[data-ai^="tokens.plan."]', title: "Plans", body: "More tokens every month. Switching takes effect right away." },
        { target: '[data-ai^="tokens.topup."]', title: "Top-ups", body: "One-time packs that never expire." },
        ...SHELL.slice(2, 3),
      ],
    },
  },
]

export function tourFor(path: string): Tour {
  return TOURS.find((t) => t.match(path))?.tour ?? { id: `page:${path}`, name: "This page", steps: [{ target: '[data-tour="page-header"]', title: "This page", body: "The title and the line under it say what this page is for." }, ...SHELL] }
}
