// What each page of the app is, and its controls by the stable name written in the
// frontend code (`data-ai="..."`). The assistant reads this to know a page BEFORE
// it is open; the live page only adds what changes (list rows, values).
// page-registry.spec.ts fails if a name here is missing from the frontend code.
//   id   exact name, or with <angle> parts for items that exist once per row
//   tpl  set when the frontend builds the name from a template: the start of it

export interface Control {
  id: string;
  label: string;
  does: string;
  tpl?: string;
}
export interface PageEntry {
  path: string;
  purpose: string;
  controls: Control[];
}

const nav = (name: string, path: string): Control => ({
  id: `nav.${name}`,
  label: name[0].toUpperCase() + name.slice(1),
  does: `Sidebar: go to ${path}`,
  tpl: 'nav.',
});

export const PAGES: Record<string, PageEntry> = {
  everywhere: {
    path: 'every page',
    purpose: 'The sidebar is on every page.',
    controls: [
      nav('home', '/'),
      nav('jobs', '/jobs'),
      nav('applications', '/applications'),
      nav('following', '/following'),
      nav('career', '/career'),
      nav('extension', '/extension'),
      nav('messages', '/messages'),
      nav('notifications', '/notifications'),
      nav('profile', '/profile'),
      { id: 'nav.logo', label: 'Plato logo', does: 'Goes to / (Home)' },
      {
        id: 'crumb.<page>',
        label: 'Breadcrumb above the title (e.g. JOBS, CAREER)',
        does: 'Goes back up to that parent page; on a search it is crumb.jobs',
        tpl: 'crumb.',
      },
      {
        id: 'tour.start',
        label: 'Tour this page (compass, bottom right)',
        does: 'Starts a guided tour of the page the seeker is on',
      },
    ],
  },
  home: {
    path: '/',
    purpose:
      "Home: the seeker's week at a glance. Greeting with new matches, applications sent, interviews (the ones the seeker marked on their applications) and this week's goal; the top 3 matches as cards with Apply and save; their applications (sent / viewed / interview) and latest moves; new roles from companies they follow. Questions about how the hunt is going are answered here.",
    controls: [
      {
        id: 'home.matches',
        label: 'Jobs for you (number)',
        does: 'Goes to /jobs',
      },
      {
        id: 'home.applied',
        label: 'Applied (number)',
        does: 'Goes to /applications',
      },
      {
        id: 'home.interviews',
        label: 'Interviews (number)',
        does: 'Opens sent applications; counts the ones the seeker marked as an interview or offer',
      },
      {
        id: 'home.next-step',
        label: 'Your next steps button',
        does: 'Does the next setup step: complete details, link the extension, first search, apply, or set an alert',
      },
      {
        id: 'home.first-search',
        label: 'Start a search',
        does: 'Starts a new search conversation, shown when there are no matches yet',
      },
      { id: 'home.all-jobs', label: 'See all', does: 'Goes to /jobs' },
      {
        id: 'home.apply:<jobId>',
        label: 'Apply on a top match',
        does: 'Opens the apply-with-the-extension dialog for that job',
        tpl: 'home.apply:',
      },
    ],
  },
  jobs: {
    path: '/jobs',
    purpose:
      'Jobs: the seeker\'s searches on the left (each a Plato conversation, grouped by day, with New search and a Following card), every match across all searches on the right, best first. Tabs For you / Saved / Applied, quick filters (Remote, Senior, Posted this week), a checkbox on each job, Select my top 10, and a bar to apply to the selected jobs. This is where "my last search" is found.',
    controls: [
      {
        id: 'jobs.new-search',
        label: 'New search',
        does: 'Starts a new search conversation',
      },
      {
        id: 'jobs.following',
        label: 'Following card',
        does: 'Goes to /following',
      },
      {
        id: 'jobs.search:<searchId>',
        label: 'A search in the left column (its name)',
        does: "Opens that search's conversation and results (/jobs/<searchId>)",
        tpl: 'jobs.search:',
      },
      {
        id: 'jobs.top-ten',
        label: 'Select my top 10',
        does: 'Ticks the 10 best jobs that are not applied to yet',
      },
      {
        id: 'jobs.job:<jobId>',
        label: 'A job title',
        does: 'Opens the original posting in a new tab',
        tpl: 'jobs.job:',
      },
      {
        id: 'jobs.apply:<jobId>',
        label: 'Apply on a job',
        does: 'Opens the apply-with-the-extension dialog for that job',
        tpl: 'jobs.apply:',
      },
      {
        id: 'jobs.tab.<tab>',
        label: 'For you | Saved | Applied | Hidden',
        does: 'Switches the list (tab = discover, saved, applied, hidden)',
        tpl: 'jobs.tab.',
      },
      {
        id: 'jobs.apply-selected',
        label: 'Apply (bottom bar)',
        does: 'Opens the apply dialog for every ticked job, with their own CV',
      },
      {
        id: 'jobs.tailor-selected',
        label: 'Tailor & apply (bottom bar)',
        does: 'Opens /jobs/review for the ticked jobs: Plato writes one resume per job to review before applying',
      },
    ],
  },
  review: {
    path: '/jobs/review',
    purpose:
      'Review your tailored resumes: Plato writes one resume per ticked job, one at a time, and shows only what changed from the profile (summary, experience order, keywords). Each job can be approved or set to use the original CV; nothing is sent until Approve all & apply.',
    controls: [
      {
        id: 'review.approve',
        label: 'Approve',
        does: 'Approves the resume shown for this job and moves to the next one',
      },
      {
        id: 'review.approve-all',
        label: 'Approve all & apply (N)',
        does: 'Approves every written resume and opens the apply dialog with them',
      },
    ],
  },
  results: {
    path: '/jobs/<searchId>',
    purpose:
      'One search: its results list with tabs, filters, sorting and applying. If the search is still running it shows live progress instead.',
    controls: [
      {
        id: 'results.tab.<tab>',
        label: 'Discover | Saved | Applied | Recommended',
        does: 'Switches the list (tab = discover, saved, applied, recommended)',
        tpl: 'results.tab.',
      },
      {
        id: 'results.filters',
        label: 'Filter bar',
        does: 'Row of filters (location, type, level, posted, salary) and sorting',
      },
      {
        id: 'results.apply-top',
        label: 'Apply to top 15 jobs',
        does: 'Opens a confirmation to apply to the best matches',
      },
      {
        id: 'results.apply-selected',
        label: 'Apply to selected',
        does: 'Opens a confirmation for the ticked jobs',
      },
      {
        id: 'results.job:<n>',
        label: 'Job title of row n (1 = top)',
        does: 'Opens the original posting in a new tab',
        tpl: 'results.job:',
      },
      {
        id: 'results.save:<n>',
        label: 'Bookmark on row n',
        does: 'Saves or unsaves that job',
        tpl: 'results.save:',
      },
      {
        id: 'results.mock-interview:<n>',
        label: 'Bot icon on row n',
        does: 'Starts a mock interview for that job (takes a few seconds)',
        tpl: 'results.mock-interview:',
      },
    ],
  },
  applications: {
    path: '/applications',
    purpose:
      "Every application: tiles (sent in 30 days, sent this week, went through, need you), tabs All / In progress / Sent / Didn't go through, a table (job, status, date, resume used) and on the right 'Needs you': what Plato paused on, each with one button that opens the answer. Paths: ?tab=active|applied|problems|needs.",
    controls: [
      {
        id: 'applications.tab.<tab>',
        label: 'Status tabs',
        does: 'Filters the list by status',
        tpl: 'applications.tab.',
      },
      {
        id: 'applications.row:<applicationId>',
        label: 'An application',
        does: 'Opens that application (/applications/<id>)',
        tpl: 'applications.row:',
      },
      {
        id: 'applications.retry:<applicationId>',
        label: 'Retry',
        does: 'Puts a failed application back in the queue',
        tpl: 'applications.retry:',
      },
    ],
  },
  application: {
    path: '/applications/<applicationId>',
    purpose: 'One application: what happened, proof, resume used.',
    controls: [
      { id: 'application.back', label: 'Back', does: 'Back to /applications' },
      {
        id: 'application.retry',
        label: 'Retry',
        does: 'Retries a failed application',
      },
      {
        id: 'application.withdraw',
        label: 'Withdraw',
        does: 'Starts withdrawing (asks to confirm first)',
      },
      {
        id: 'application.outcome.interview',
        tpl: 'application.outcome.',
        label: 'Did you hear back? Interview',
        does: 'Marks a sent application as an interview (the seeker says so; Plato cannot read replies). Siblings: .none, .viewed, .offer, .rejected',
      },
    ],
  },
  career: {
    path: '/career',
    purpose:
      'Career chat with its own assistant: build or improve a resume, tailor to a job, mock and voice interviews, prove a skill. Links to interviews history and skills gap.',
    controls: [
      {
        id: 'career.interviews',
        label: 'Interviews',
        does: 'Opens /career/interviews',
      },
      {
        id: 'career.skills',
        label: 'Skills gap',
        does: 'Opens /career/skills',
      },
      {
        id: 'career.new-conversation',
        label: 'New conversation',
        does: 'Starts a fresh Career chat',
      },
      {
        id: 'career.start:<slug>',
        label: 'Starter cards',
        does: 'Sends that request to the Career chat. slugs: build-my-resume, tailor-to-a-job, improve-my-resume, mock-interview-text, prove-a-skill, voice-interview (opens the voice call)',
        tpl: 'career.start:',
      },
      {
        id: 'career.voice',
        label: 'Voice interview',
        does: 'Opens the voice call panel',
      },
      {
        id: 'chat.input',
        label: 'Message box',
        does: 'Type a message to the Career assistant',
      },
      { id: 'chat.send', label: 'Send', does: 'Sends the typed message' },
      {
        id: 'chat.attach',
        label: 'Attach a CV',
        does: 'Picks a PDF or Word file',
      },
    ],
  },
  interviews: {
    path: '/career/interviews',
    purpose:
      'History of text mock interviews with scores. New ones start from the bot icon on a job in search results.',
    controls: [
      {
        id: 'interviews.row:<interviewId>',
        label: 'An interview',
        does: 'Opens it (questions, answers, scorecard)',
        tpl: 'interviews.row:',
      },
    ],
  },
  interview: {
    path: '/career/interviews/<interviewId>',
    purpose:
      'One mock interview: answer the current question, then see the scorecard.',
    controls: [
      { id: 'interview.answer', label: 'Answer box', does: 'Type the answer' },
      {
        id: 'interview.send',
        label: 'Send answer',
        does: 'Submits the answer',
      },
      {
        id: 'interview.retry',
        label: 'Retry the same interview',
        does: 'New session with the same questions (after finishing)',
      },
    ],
  },
  skills: {
    path: '/career/skills',
    purpose:
      'Skills gap: skills the best-matching jobs ask for that the profile does not show, with how many jobs each would unlock. Read-only.',
    controls: [],
  },
  notifications: {
    path: '/notifications',
    purpose: 'Finished searches and application updates.',
    controls: [
      {
        id: 'notifications.filter.<key>',
        label: 'All | Unread | Applications | Searches',
        does: 'Filters the list (key = all, unread, application, run)',
        tpl: 'notifications.filter.',
      },
      {
        id: 'notifications.mark-all-read',
        label: 'Mark all read',
        does: 'Marks everything read',
      },
      {
        id: 'notifications.item:<id>',
        label: 'A notification',
        does: 'Opens what it is about',
        tpl: 'notifications.item:',
      },
    ],
  },
  profile: {
    path: '/profile',
    purpose:
      "The seeker's profile, in tabs (?tab=...): resumes (default: the master resume with its score, and the versions Plato tailored), experience (from the CV, plus three forms resumes use, filled with type_text then submitted. Project: p-name, p-desc, p-tech, p-result, p-url. Result (achievement): a-text, a-metric, a-company. Skill with proof: s-skill, s-proof, s-url, plus a level button), looking (what they want), answers (application answers), documents (files and the browser extension).",
    controls: [
      {
        id: 'profile.add-project',
        label: 'Add project',
        does: 'Saves the project form',
      },
      {
        id: 'profile.add-result',
        label: 'Add result',
        does: 'Saves the result form',
      },
      {
        id: 'profile.add-skill',
        label: 'Add skill',
        does: 'Saves the skill-with-proof form',
      },
    ],
  },
  following: {
    path: '/following',
    purpose:
      'Companies and roles the seeker follows: company cards (roles for you, open roles, See roles opens /jobs?company=<name>, a bell to pause, Unfollow), new roles from the latest digest with View and Apply, roles they follow with on/off switches, Alert settings (how often, email), and companies to follow with a search box.',
    controls: [
      {
        id: 'following.see-roles',
        label: 'See roles (on a company card)',
        does: "Opens /jobs?company=<name>: that company's roles",
      },
    ],
  },
  extension: {
    path: '/extension',
    purpose:
      'The Plato Apply Chrome extension: make a one-time code to link a browser, the browsers already linked, and recent runs.',
    controls: [
      {
        id: 'extension.generate',
        label: 'Generate code',
        does: 'Makes a one-time code to paste into the extension',
      },
    ],
  },
  tokens: {
    path: '/tokens',
    purpose:
      "Plan & credits: the seeker's Plato tokens balance, plan, what actions cost, and upgrades.",
    controls: [],
  },
  messages: {
    path: '/messages',
    purpose: 'Not built yet (coming soon page).',
    controls: [],
  },
};

export const PAGE_KEYS = Object.keys(PAGES) as [string, ...string[]];

// One line per page for the prompt; the full entry comes from describe_page.
export const pageIndex = () =>
  Object.entries(PAGES)
    .map(([k, p]) => `- ${k} (${p.path}): ${p.purpose}`)
    .join('\n');

// The page a named control lives on, when that page has a fixed address.
export function pathOfControl(id: string): string | null {
  for (const p of Object.values(PAGES)) {
    if (p.path.includes('<') || p.path === 'every page') continue;
    if (p.controls.some((c) => c.id === id || (c.tpl && id.startsWith(c.tpl))))
      return p.path;
  }
  return null;
}
