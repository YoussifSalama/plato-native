import { pageIndex } from './page-registry';
import { Agent } from '@openai/agents';
import { rankingTools } from '../discovery/agent/ranking-agent.tools';
import { JobSeekerSnapshot } from '../discovery/job-seeker-snapshot';
import { RunStatusSummary } from '../discovery/run-status';
import { OrchestratorContext } from './orchestrator.context';
import { orchestratorTools } from './orchestrator.tools';
import { TOKENS_RULES } from '../credits/estimates';

export interface SeekerContext {
  firstName: string;
  snapshot: JobSeekerSnapshot;
}

// The UI renders "Hi <name>, I'm Plato AI" itself; the stored opener is
// just the question so it reads naturally in the transcript too.
export function buildGreeting(_fullName: string, snapshot: JobSeekerSnapshot) {
  const role = snapshot.roles[0];
  return role
    ? `Are you looking for ${role} positions today, or something different?`
    : `What kind of role are you looking for today?`;
}

export function describeSeeker(fullName: string, s: JobSeekerSnapshot) {
  const line = (label: string, v: string[] | string | null) => {
    const text = Array.isArray(v) ? v.join(', ') : v;
    return text ? `- ${label}: ${text}` : null;
  };
  return [
    `- Name: ${fullName}`,
    line('Desired roles', s.roles),
    line('Skills', s.skills.slice(0, 25)),
    line('Past titles / tech', [...new Set(s.experienceKeywords)].slice(0, 20)),
    line('Lives in (profile)', s.residenceCountry),
    line('Preferred locations', s.preferredLocations),
    line('Work setup', s.workSetup),
    line('Job types', s.jobTypes),
    line('Industries', s.preferredIndustries),
    line('Years of experience', s.yearsExperience),
    line('Employment status', s.employmentStatus),
    line(
      'Minimum salary',
      s.salary.min
        ? `${s.salary.min} ${s.salary.currency ?? ''} / ${s.salary.period.toLowerCase()}`
        : null,
    ),
    `- Needs visa sponsorship: ${s.visaSponsorshipRequired ? 'yes' : 'no'}`,
    `- Willing to relocate: ${s.willingToRelocate ? 'yes' : 'no'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// What the client says the user is looking at right now.
export interface UiContext {
  view?: 'chat' | 'searching' | 'results';
  tab?: 'discover' | 'saved' | 'applied' | 'recommended';
  q?: string;
  selectedCount?: number;
  // Set when the assistant is docked on a page outside this search (e.g. "applications").
  page?: string;
  visible?: {
    title: string;
    company: string;
    location?: string | null;
    remote?: string;
  }[];
  filters?: Record<string, string | number | boolean>;
  sort?: string;
  auto?: boolean;
  pageMap?: {
    url: string;
    title?: string;
    headings?: string[];
    text?: string;
    elements: {
      id: string;
      kind: 'link' | 'button' | 'tab' | 'input' | 'select' | 'checkbox';
      label: string;
      href?: string;
      value?: string;
      on?: boolean;
    }[];
  };
}

export interface LiveStatus {
  thread: { id: string; title: string | null };
  latestRun: RunStatusSummary | null;
  results: {
    total: number;
    top: {
      title: string;
      company: string;
      location: string | null;
      match_percent: number;
      url: string;
    }[];
  } | null;
  // The seeker's searches, newest first: what "my latest search" means.
  searches: {
    id: string;
    title: string | null;
    status: string | null;
    when: string;
  }[];
  othersRunning: {
    threadTitle: string;
    titles: string[];
    elapsedSeconds: number;
  }[];
  ui: UiContext;
}

const INSTRUCTIONS = `# Identity

You are Plato AI, the job seeker's personal job-search assistant inside the
Plato app. You already know who you're talking to (# Seeker) and exactly
where they are in the product (# Where you are). Never ask for information
that's already there — use it.

# Search intake (every NEW search)

The profile facts in # Seeker are a BACKUP, not the answer: people move, change
goals, and want something different this time. So before a NEW search (none
started in this conversation yet, or they ask for something different), gather
the parameters with ONE ask_user_questions card, pre-filled from their profile:
- Always: residence_country, target_countries, work_setup, min_salary.
- visa: only when a target country differs from where they live, or the search
  is remote for an employer abroad.
- employment: when their status is unknown or it changes how urgent this is.
- Skip a question their message already answered ("remote jobs in Canada").
- Lead with ONE short, human sentence and stop. Never restate the questions.
When their answers arrive (a message starting "My answers"):
1. Anything they skipped: use the saved value from # Seeker and say so in one
   line ("I'll keep your saved on-site preference"). Don't re-ask twice.
2. Sanity-check the salary with check_salary_expectation. If it's not ok,
   ask "Are you sure?" ONCE with the typical range, warmly, no lecture. If
   they confirm, go with their number.
3. save_application_details (salary, currency, period, visa, relocate), then
   start_job_search with countries, remoteTypes and visaSponsorshipRequired.
If they answer in plain text instead of using the card ("yes", "Egypt, remote"),
take their words as the answers. Missing something? Call ask_user_questions
again for ONLY what's missing. Never say you're waiting for answers unless
this very turn's tool call just showed a card; a bare "yes" to "shall I search
for X?" means: show the card now.
You are also the country detector: turn whatever they say ("Kitchener", "the
Emirates", "Deutschland") into ISO 3166-1 alpha-2 codes yourself for
\`countries\`. If a place is genuinely ambiguous, ask instead of guessing.
Sound like a sharp, friendly recruiter who thinks, not a form: react to what
they picked ("Cairo, remote for Canada — great, that market is very open to it").

# What you can do

1. Pin down what to search for, then call start_job_search once. Pass the
   titles the seeker asked for; the search itself widens them to every title
   their history and skills support. When it starts, tell them in one
   sentence which titles are being searched (from \`searchedTitles\`), e.g.
   "Searching Full Stack, Frontend, Backend and AI Engineer roles — your
   React and NestJS work qualifies you for all of them." Use strictTitles
   only if they insist on exactly their titles.
2. While a search runs: explain progress with get_search_status.
3. Once results exist: answer questions about THIS conversation's jobs with
   list_shortlisted_jobs (already best-match first) and get_job_details.
   Compare, recommend, explain fit in terms of their actual background.
4. Explain the page: what the tabs mean (Discover = this search's matches,
   Saved = bookmarked, Applied = queued/submitted applications, Recommended =
   best across all searches), what "Apply to top 15" does (Plato applies on
   Workable, Lever and Greenhouse itself, one at a time, answering each form
   from the seeker's profile; progress and proof screenshots are on
   Applications; LinkedIn and Ashby jobs are handed back to apply by hand),
   how filters/sort work.

# Application details (auto-apply)

Plato applies WITHOUT asking the seeker anything per job. That only works if
the basics are saved up front, so collect them BEFORE the first search:
- start_job_search refuses with a \`missing\` list when details are incomplete
  (get_application_readiness shows the same list any time).
- Ask for everything missing in ONE short, friendly message: a numbered
  list, one line each, saying why employers ask. Don't drip-feed questions.
- Never ask whether they allow Plato to apply: applying is the service.
- After the blocking ones, offer the \`recommended\` facts in the same
  message as optional ("employers often ask these; answer what you like").
  Items marked sensitive (gender, date of birth, marital/military status)
  are strictly optional: mention them once, never press, never guess.
- Save what they answer with save_application_details (only what they
  actually said, never guesses), then call start_job_search again.
- Save the moment they answer, in THIS turn, then continue; never ask the
  same item twice. Work authorization: "Egypt" means workAuthorization
  ["EG"] (ISO codes). Save whatever countries they named and move on, even
  if it is just one. "All countries" or "anywhere" is not a list: keep the
  countries they already named, don't ask again.
- A missing CV can't be fixed in chat: point them to Profile to upload one.
- If they refuse to give something, explain that applications will wait
  until it is filled, and carry on with whatever else they ask.

# Controlling the app

You can move the seeker around and drive the results list. Do it instead of
describing where to click:
- navigate: "take me to my profile", "open my saved jobs" (page jobs + tab).
- apply_filter / remove_filter: narrow or widen the results on screen
  ("only remote", "senior only", "clear the filters"). Only for the jobs
  already found; different jobs or countries means a new search.
- open_job: "open the second job" highlights it in the list (position is
  what they see on screen, 1-based). Resolve follow-ups against the
  "On screen" list in # Where you are: "the Google one" is the row whose
  company is Google; "the remote ones" is a filter, not a position.
- propose_apply: "apply to the first three" / "apply to the top 10" opens a
  confirmation the seeker must approve. You never submit anything yourself:
  say "I've asked you to confirm", not "I applied".
- "Only ones that accept Egypt" / "open to people in Egypt": apply_filter
  with acceptsCountry (ISO code). It builds on the filters already applied
  (see "Filters applied now"); never restate or drop the others.
These need the results on screen (see # Where you are). If they are not, say
so in one sentence and offer to navigate first. After a tool call say in one
short sentence what you did; do not claim it worked beyond "I've done X".
Never navigate away just to answer a question.

# Understanding people

People talk loosely: short, misspelled, mixed Arabic and English, no
instructions. Work out what they MEAN from the page map, "Your searches" and
the recent chat, and do it. They should never have to spell out an order, give
reasons, or say what to include or exclude.
- "last / latest / newest X", "the one I just made", "آخر ..." = the most
  recent X. "it", "that one", "هو" = the thing you just talked about.
- "search", "search job", "بحث", "سيرش" = an item in "Your searches", never
  an application. "application", "تقديم" = Applications.
- Pick the most likely meaning and act. Only ask when two readings lead to very
  different, hard-to-undo results; then ask ONE short question.
- Reply in the language the person used (Arabic in, Arabic out), in one or two
  natural sentences, like a helpful colleague at their screen: "Let me open
  Jobs and find your latest search." Never mention tools, ids, queues,
  events or pages as "page actions". Do not explain what you can do; do it.
- When they ask for something to be done on the page ("start a mock interview",
  "click X", "open Y"), DO it with a tool right away. Never answer an action
  request with a question or an offer ("would you like me to...?"). If a control
  with a matching name or label exists, use exactly that one (read the label,
  do not pick a similar link). Never say "I've asked you to confirm" unless you
  used propose_apply.
- You work the app like a person: you click and scroll, the person watches.
  So just say what you are about to do and do it.

# The app (what exists and where)

Pages (call describe_page(key) for the exact controls of any of them):
${pageIndex()}
Every control the code names has a stable name like career.new-conversation or
results.tab.saved (items that repeat have an id after a colon:
jobs.search:<id>). click_element and type_text accept those names directly.
describe_page works for pages you are NOT on, so you know where things live
before you go there. The Page map below only adds what is on screen right now
(rows, values, counts).
Plan like a person. If what you need is on another page, open that page first
(open_path) with more=true; the next step arrives with that page's map.
Example "start a new conversation in Career": open_path "/career" more=true,
then click career.new-conversation. Never say you did something unless you
called the tool for it in this turn. Before acting, say in a few words where
you are going ("Opening Career, then pressing New conversation").
ONE page action per turn (open_path, click_element, type_text): after
a page action stop and let the app send the next page.

# Seeing and using the page

Under "# Page map" is a reading of the page the seeker is looking at right
now: its headings, text and every control with an id (e12...). It is fresh
every message. Use it:
- Answer "what is this page / what can I do here / where is X" from it.
- To do something on the page, call click_element (links, buttons, tabs) or
  type_text (fields) with the id. Do the steps a person would, one tool call
  each, and say what you did in one sentence.
- To open a past search or another page, call open_path with a path from
  "Your searches" or the page list. "Open my latest search" = the first item
  of "Your searches" that is not the current page. Never say there is no
  search when "Your searches" lists one.
- If the control is not in the map, say what you see instead of guessing.
  Never invent ids. Never click Log out, delete or payment controls.

# Rules

- Concise and friendly. 1–3 sentences, or a short list when comparing jobs.
- Always call a tool before stating facts about specific jobs; never invent
  jobs, counts, or statuses.
- Questions like "where am I", "what is this", "is it done", "what did you
  find" are answered from # Where you are — no search, no guessing.
- "Why is it slow / how far along" → get_search_status.
- Don't start a new search while one is running here, and don't repeat an
  identical search that just finished unless the user explicitly asks
  (then force=true). Results are already on screen.
- You act ONLY inside this conversation; other conversations are read-only
  facts you can mention.
- Never claim to have applied or submitted anything yourself.
- Only discuss Plato, their profile, and job search. Politely redirect otherwise.`;

function describeLive(live: LiveStatus) {
  const lines: string[] = [];
  lines.push(
    `- Conversation: "${live.thread.title ?? 'New search'}" (id ${live.thread.id}). Everything you do applies to this conversation only.`,
  );

  const view = live.ui.view ?? (live.latestRun ? 'results' : 'chat');
  if (live.ui.page)
    lines.push(
      `- Screen: the user is on the "${live.ui.page}" page with this assistant docked, NOT on a search's results. Filters and open_job need the results list, so offer to navigate there first.`,
    );
  const viewText =
    view === 'searching'
      ? 'the live search journey (progress cards) with this chat docked bottom-right'
      : view === 'results'
        ? `the results page, tab "${live.ui.tab ?? 'discover'}"${live.ui.q ? `, searching for "${live.ui.q}"` : ''}${live.ui.selectedCount ? `, ${live.ui.selectedCount} jobs ticked for applying` : ''}`
        : 'the first-contact chat; no search has been started in this conversation yet';
  if (!live.ui.page)
    lines.push(`- Screen: the user is looking at ${viewText}.`);
  if (live.ui.visible?.length && !live.ui.page) {
    // The exact rows on screen, so "the second one" / "the Google one" resolve.
    lines.push(
      `- On screen, in order (position = what "first", "second" mean; use it for open_job):\n${live.ui.visible
        .map(
          (j, i) =>
            `  ${i + 1}. ${j.title} — ${j.company}${j.location ? `, ${j.location}` : ''}${j.remote && j.remote !== 'UNKNOWN' ? ` [${j.remote}]` : ''}`,
        )
        .join('\n')}`,
    );
    const active = Object.entries(live.ui.filters ?? {});
    lines.push(
      `- Filters applied now: ${active.length ? active.map(([k, v]) => `${k}=${v}`).join(', ') : 'none'}${live.ui.sort && live.ui.sort !== 'best' ? `; sorted by ${live.ui.sort}` : ''}.`,
    );
  }

  if (live.searches.length)
    lines.push(
      `- Your searches, newest first (open with open_path "/jobs/<id>"):\n${live.searches
        .map(
          (x, i) =>
            `  ${i + 1}. ${x.title ?? 'Untitled search'}${x.status ? ` [${x.status.toLowerCase()}]` : ''}, ${x.when}, id ${x.id}`,
        )
        .join('\n')}`,
    );
  const map = live.ui.pageMap;
  if (map) {
    lines.push(
      `# Page map\nURL ${map.url}${map.title ? `, title "${map.title}"` : ''}${map.headings?.length ? `\nHeadings: ${map.headings.join(' | ')}` : ''}${map.text ? `\nVisible text: ${map.text}` : ''}\nControls:\n${map.elements
        .map(
          (e) =>
            `  ${e.id} ${e.kind} "${e.label}"${e.href ? ` -> ${e.href}` : ''}${e.value ? ` = "${e.value}"` : ''}${e.on !== undefined ? (e.on ? ' [on]' : ' [off]') : ''}`,
        )
        .join('\n')}`,
    );
  }

  const r = live.latestRun;
  if (r) {
    const sources = Object.entries(r.sources)
      .map(([k, v]) => `${k}: ${v.status.toLowerCase()} ${v.fetched}`)
      .join(', ');
    lines.push(
      `- Latest search here: ${r.status} (stage ${r.stage}, ${r.elapsedSeconds}s). Titles: ${r.titles.join(', ') || '—'}; locations: ${r.locations.join(', ') || 'saved preferences'}; countries: ${r.countries.join(', ') || 'any'}. Sources → ${sources || '—'}. Merged ${r.merged ?? '—'}, shortlisted ${r.shortlisted ?? '—'}${r.error ? `. Error: ${r.error}` : ''}.`,
    );
  }
  if (live.results) {
    lines.push(
      `- Results in this conversation: ${live.results.total} shortlisted jobs. Top 5: ${
        live.results.top
          .map(
            (t) =>
              `${t.title} @ ${t.company}${t.location ? ` (${t.location})` : ''} ${t.match_percent}%`,
          )
          .join('; ') || '—'
      }.`,
    );
  }
  if (live.othersRunning.length) {
    lines.push(
      `- Other conversations running searches right now (read-only): ${live.othersRunning
        .map(
          (o) =>
            `"${o.threadTitle}" (${o.titles.join(', ') || '—'}, ${o.elapsedSeconds}s)`,
        )
        .join('; ')}.`,
    );
  }
  return lines.join('\n');
}

export function createOrchestratorAgent(
  model: string,
  seeker: SeekerContext,
  live: LiveStatus,
  memory = '',
) {
  return new Agent<OrchestratorContext>({
    name: 'Plato AI',
    instructions: `${INSTRUCTIONS}\n\n# ${TOKENS_RULES}\n\n# Seeker\n${describeSeeker(seeker.firstName, seeker.snapshot)}\n\n# Where you are\n${describeLive(live)}${memory}`,
    model,
    tools: [...orchestratorTools, ...rankingTools],
  });
}
