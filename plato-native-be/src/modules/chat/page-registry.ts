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
      nav('career', '/career'),
      nav('messages', '/messages'),
      nav('notifications', '/notifications'),
      nav('profile', '/profile'),
      { id: 'nav.logo', label: 'Plato logo', does: 'Goes to / (Home)' },
    ],
  },
  home: {
    path: '/',
    purpose:
      "Home dashboard: the seeker's job hunt in numbers. KPIs (jobs ready, applications, searches, postings analyzed), pipeline, match quality, last 14 days, sources, work setup, seniority, salary, top locations and companies, and the latest searches. Questions about how the hunt is going are answered here.",
    controls: [
      { id: 'home.new-search', label: 'New search', does: 'Starts a new search conversation' },
      { id: 'home.first-search', label: 'Start your first search', does: 'Same, shown when there are no searches' },
      { id: 'home.needs-you', label: 'Answer now', does: 'Opens /applications, shown when applications need answers' },
      { id: 'home.all-searches', label: 'All searches', does: 'Goes to /jobs' },
      { id: 'home.search:<searchId>', label: 'A latest-search card', does: "Opens that search's results (/jobs/<searchId>)", tpl: 'home.search:' },
    ],
  },
  jobs: {
    path: '/jobs',
    purpose:
      'Table of every search the seeker ran (one row per search), with a text search, status tabs, an active-since filter and sorting. A row opens that search; its chevron expands the top 5 ranked jobs of that search, each with save, not interested and apply. This is where "my last search" is found.',
    controls: [
      { id: 'jobs.new-search', label: 'New search', does: 'Starts a new search conversation' },
      { id: 'jobs.first-search', label: 'Start your first search', does: 'Same, shown when there are no searches' },
      { id: 'jobs.filter.q', label: 'Search by name, role or location', does: 'Filters the table as you type' },
      { id: 'jobs.status.<status>', label: 'All | Searching | Ready | Failed | Not started', does: 'Filters by status (status = all, running, done, failed, idle)', tpl: 'jobs.status.' },
      { id: 'jobs.filter.since', label: 'Active since', does: 'Any time, last 7, 30 or 90 days' },
      { id: 'jobs.sort', label: 'Sort', does: 'Last activity, newest first, most jobs, name A-Z' },
      { id: 'jobs.filter.clear', label: 'Clear filters', does: 'Resets search, status and date' },
      { id: 'jobs.search:<searchId>', label: 'A search row (its name)', does: "Opens that search's results (/jobs/<searchId>)", tpl: 'jobs.search:' },
      { id: 'jobs.expand:<searchId>', label: 'Chevron on a row', does: 'Shows or hides the top 5 jobs of that search', tpl: 'jobs.expand:' },
      { id: 'jobs.top-job:<jobId>', label: 'A top job title', does: 'Opens the original posting in a new tab', tpl: 'jobs.top-job:' },
      { id: 'jobs.top-apply:<jobId>', label: 'Apply on a top job', does: 'Opens the apply-with-the-extension dialog for that job', tpl: 'jobs.top-apply:' },
    ],
  },
  results: {
    path: '/jobs/<searchId>',
    purpose:
      'One search: its results list with tabs, filters, sorting and applying. If the search is still running it shows live progress instead.',
    controls: [
      {
        id: 'results.all-searches',
        label: 'All searches',
        does: 'Back to /jobs',
      },
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
    purpose: 'Jobs the seeker applied to (or queued), with their status.',
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
      'What the seeker can add that resumes use. Three forms, filled with type_text then submitted. Project: p-name, p-desc, p-tech, p-result, p-url. Result (achievement): a-text, a-metric, a-company. Skill with proof: s-skill, s-proof, s-url (plus a level button).',
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
