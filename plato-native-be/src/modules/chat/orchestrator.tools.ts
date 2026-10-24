import { PAGE_KEYS, PAGES } from './page-registry';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { isRecentIdentical, summarizeRun } from '../discovery/run-status';
import { COUNTRY_CODES, isCountryCode } from '../discovery/countries';
import { checkSalary } from '../discovery/salary-sanity';
import { buildQuestionCard, QUESTION_IDS } from './intake';
import {
  APP_PAGES,
  FILTER_KEYS,
  OrchestratorContext,
  UiFilters,
} from './orchestrator.context';

const startJobSearchParams = z.object({
  titles: z
    .array(z.string().min(1))
    .min(1)
    .max(3)
    .describe(
      'The 1-3 job titles the seeker ASKED for, in their words. Do not add related titles yourself: the search automatically plans up to 8 titles from their work history and skills (e.g. "Software Engineer" also searches Full Stack / Frontend / Backend Developer when their background supports it).',
    ),
  strictTitles: z
    .boolean()
    .describe(
      'True ONLY when the seeker explicitly said to search for exactly these titles and nothing else. Otherwise false.',
    ),
  locations: z
    .array(z.string().min(1))
    .nullable()
    .describe(
      'City/country names to search in. Null keeps the saved preferences.',
    ),
  countries: z
    .array(z.enum(COUNTRY_CODES))
    .nullable()
    .describe(
      'ISO country codes to restrict the search to (e.g. CA, US, EG). Country decides which job boards run and drops jobs based elsewhere, so set it whenever the seeker names a country ("jobs in Canada", "only US"). Null derives it from the locations.',
    ),
  visaSponsorshipRequired: z
    .boolean()
    .nullable()
    .describe(
      'True when the seeker said they need visa sponsorship for this search, false when they can already work there. Null keeps the saved preference.',
    ),
  remoteTypes: z
    .array(z.enum(['onsite', 'hybrid', 'remote', 'any']))
    .nullable()
    .describe('Work setup filter. Null keeps the saved preferences.'),
  jobTypes: z
    .array(
      z.enum([
        'full_time',
        'part_time',
        'contract',
        'freelance',
        'internship',
        'temporary',
      ]),
    )
    .nullable()
    .describe('Employment types. Null keeps the saved preferences.'),
  force: z
    .boolean()
    .describe(
      'Only true when the user explicitly asked to search AGAIN after an identical search already finished. Otherwise false.',
    ),
});

export const startJobSearchTool = tool<
  typeof startJobSearchParams,
  OrchestratorContext
>({
  name: 'start_job_search',
  description:
    'Start ONE background search for THIS conversation across LinkedIn, the ATS boards (Workable, Lever, Greenhouse, Ashby) and the job boards that serve the seeker country (Indeed, Google Jobs, ZipRecruiter, Glassdoor, Talent.com, Job Bank, Jobillico, Dice, Handshake, Built In, Wuzzuf). Refuses while a search is already running here, and refuses to repeat an identical search that finished in the last 30 minutes unless force=true. Never use it to answer questions about progress — use get_search_status for that.',
  parameters: startJobSearchParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    // Auto-apply never stops to ask per job, so the basics come first.
    const readiness = await ctx.applyService.readiness(ctx.jobSeekerId);
    if (!readiness.ready)
      return JSON.stringify({
        started: false,
        reason:
          'The application details are incomplete. Ask the seeker for everything in `missing` in ONE friendly message, save their answers with save_application_details, then call start_job_search again.',
        missing: readiness.missing,
      });
    const latest = await ctx.discoveryService.latestRunForThread(ctx.threadId);

    if (latest?.status === 'RUNNING') {
      return JSON.stringify({
        started: false,
        reason:
          'A search is already running in this conversation. Report its progress instead of starting another.',
        status: summarizeRun(latest),
      });
    }
    if (!input.force && isRecentIdentical(latest, input.titles)) {
      return JSON.stringify({
        started: false,
        reason:
          'An identical search finished recently and its results are already on screen. Ask the user whether they really want to run it again; only then call with force=true.',
        status: summarizeRun(latest!),
      });
    }

    const { run, reused } = await ctx.discoveryService.startRunForThread(
      ctx.jobSeekerId,
      {
        titles: input.titles,
        strictTitles: input.strictTitles,
        locations: input.locations ?? undefined,
        countries: input.countries ?? undefined,
        visaSponsorshipRequired: input.visaSponsorshipRequired ?? undefined,
        remoteTypes: input.remoteTypes ?? undefined,
        jobTypes: input.jobTypes ?? undefined,
      },
      ctx.threadId,
    );
    ctx.events.push({ type: 'search_started', runId: run.id });
    const query = run.query as {
      titlePlan?: { title: string; reason: string }[];
    } | null;
    return JSON.stringify({
      started: !reused,
      reused,
      runId: run.id,
      query: run.query,
      // Tell the seeker which titles are being searched and why.
      searchedTitles: query?.titlePlan ?? null,
    });
  },
});

const noParams = z.object({});

export const getSearchStatusTool = tool<typeof noParams, OrchestratorContext>({
  name: 'get_search_status',
  description:
    "Read-only. Returns the latest search in THIS conversation (stage, elapsed time, per-source counts, errors) plus any searches currently running in the user's OTHER conversations (titles only). Use it whenever the user asks what is happening, why it is slow, how far along it is, or whether something else is running.",
  parameters: noParams,
  execute: async (_input, runContext) => {
    const ctx = runContext!.context;
    const [latest, running] = await Promise.all([
      ctx.discoveryService.latestRunForThread(ctx.threadId),
      ctx.discoveryService.runningForSeeker(ctx.jobSeekerId),
    ]);
    const others = running
      .filter((r) => r.thread_id !== ctx.threadId)
      .map((r) => ({
        threadTitle: r.thread?.title ?? 'Another search',
        ...summarizeRun(r),
      }));
    return JSON.stringify({
      thisConversation: latest ? summarizeRun(latest) : null,
      otherConversationsRunning: others,
      latencyNotes:
        'LinkedIn crawls typically take 30-90 seconds per title; Workable, Lever, Greenhouse and Ashby a few seconds each. Stages after crawling (merge, keyword filter, ranking) take seconds.',
    });
  },
});

export const getApplicationReadinessTool = tool<
  typeof noParams,
  OrchestratorContext
>({
  name: 'get_application_readiness',
  description:
    "Read-only. Lists what is missing before Plato can apply without asking per job: `missing` blocks applying (salary, years, notice period, work authorization, CV); `recommended` are facts employers' forms often require (links, current salary, English level, and optional sensitive ones). Call it before the first search and whenever the seeker asks why applications are waiting.",
  parameters: noParams,
  execute: async (_input, runContext) => {
    const ctx = runContext!.context;
    return JSON.stringify(await ctx.applyService.readiness(ctx.jobSeekerId));
  },
});

const saveDetailsParams = z.object({
  salaryMin: z.number().nullable().describe('Lowest acceptable salary.'),
  salaryMax: z.number().nullable().describe('Target salary.'),
  salaryCurrency: z
    .string()
    .nullable()
    .describe('ISO currency code the seeker named, e.g. EGP, USD, EUR.'),
  salaryPeriod: z.enum(['MONTHLY', 'YEARLY']).nullable(),
  yearsExperience: z
    .enum(['0-1', '1-3', '3-5', '5-10', '10+'])
    .nullable()
    .describe(
      'Bucket containing their total years of professional experience.',
    ),
  noticePeriod: z
    .enum(['immediately', 'two_weeks', 'one_month', 'three_plus_months'])
    .nullable()
    .describe('How soon they can start a new job.'),
  workAuthorization: z
    .array(z.string())
    .nullable()
    .describe(
      'Countries where they can legally work WITHOUT visa sponsorship (usually citizenship/residency).',
    ),
  visaSponsorshipRequired: z.boolean().nullable(),
  willingToRelocate: z.boolean().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  facts: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .nullable()
    .describe(
      'Intake facts the seeker stated, by the `key` from get_application_readiness.recommended (e.g. current_salary, english_level, nationality, gender). Numbers as digits, dates as YYYY-MM-DD, choices exactly as offered. Sensitive ones ONLY if they volunteered an answer.',
    ),
});

export const saveApplicationDetailsTool = tool<
  typeof saveDetailsParams,
  OrchestratorContext
>({
  name: 'save_application_details',
  description:
    'Save application details the seeker just told you. Pass ONLY what they actually said; everything else null. Never guess a salary, a country or consent. Returns what is still missing.',
  parameters: saveDetailsParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    const url = (v: string | null) =>
      v && /^https?:\/\//i.test(v) ? v : v ? `https://${v}` : null;
    const patch = {
      salary_min: input.salaryMin,
      salary_max: input.salaryMax,
      salary_currency: input.salaryCurrency?.toUpperCase() ?? null,
      salary_period: input.salaryPeriod,
      years_experience: input.yearsExperience,
      availability: input.noticePeriod,
      work_authorization: input.workAuthorization,
      visa_sponsorship_required: input.visaSponsorshipRequired,
      willing_to_relocate: input.willingToRelocate,
      linkedin_url: url(input.linkedinUrl),
      github_url: url(input.githubUrl),
      portfolio_url: url(input.portfolioUrl),
    };
    // Null means "not mentioned": never overwrite a saved value with it.
    const data = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== null && v !== undefined),
    );
    if (Object.keys(data).length)
      await ctx.preferenceService.upsert(ctx.jobSeekerId, data);
    if (input.facts?.length)
      await ctx.applyService.saveIntake(
        ctx.jobSeekerId,
        Object.fromEntries(input.facts.map((f) => [f.key, f.value])),
      );
    const readiness = await ctx.applyService.readiness(ctx.jobSeekerId);
    // Anything that was waiting on these details can move now.
    if (readiness.ready) ctx.applyService.kick();
    return JSON.stringify({
      saved: [...Object.keys(data), ...(input.facts ?? []).map((f) => f.key)],
      ...readiness,
    });
  },
});

const askParams = z.object({
  title: z
    .string()
    .nullable()
    .describe('Short card heading, e.g. "Let\'s set up this search".'),
  questions: z
    .array(z.enum(QUESTION_IDS))
    .min(1)
    .max(6)
    .describe(
      'Which questions to ask, in order. residence_country: where they live now. target_countries: where they want to work. work_setup: remote/hybrid/on-site/any. visa: sponsorship need (only when a target country differs from where they live). employment: employed now or not. min_salary: lowest acceptable pay.',
    ),
});

export const askUserQuestionsTool = tool<typeof askParams, OrchestratorContext>(
  {
    name: 'ask_user_questions',
    description:
      'Show the seeker a card of tappable questions in the chat (chips, checkboxes, a salary field), pre-filled from their profile. Use it to gather search parameters instead of asking in text. After calling it, write ONE short sentence introducing the card and stop: do not repeat the questions in text and do not call other tools until they answer.',
    parameters: askParams,
    execute: (input, runContext) => {
      const ctx = runContext!.context;
      ctx.card = buildQuestionCard(
        input.questions,
        ctx.snapshot,
        input.title ?? undefined,
      );
      return JSON.stringify({
        shown: true,
        note: 'The card is on screen, pre-filled from their profile. Their answers arrive as their next message. Wait for it.',
      });
    },
  },
);

const salaryParams = z.object({
  amount: z.number().describe('The number they said, as digits.'),
  currency: z.string().describe('ISO currency code, e.g. USD, EGP, CAD.'),
  period: z.enum(['MONTHLY', 'YEARLY']),
  residenceCountry: z
    .string()
    .nullable()
    .describe('ISO 3166-1 alpha-2 code of where they live now.'),
  targetCountries: z
    .array(z.string())
    .describe('ISO 3166-1 alpha-2 codes of where they want to work.'),
  remote: z
    .boolean()
    .describe('True when they want to work remotely for employers there.'),
});

export const checkSalaryTool = tool<typeof salaryParams, OrchestratorContext>({
  name: 'check_salary_expectation',
  description:
    'Sanity-check the minimum salary the seeker gave against where they live and where they want to work. Returns verdict ok | low | high with a typical range. When it is not ok, ask "Are you sure?" ONCE, quoting the typical range, and accept their answer if they confirm. A rough guide, never a rule: do not lecture or refuse.',
  parameters: salaryParams,
  execute: (input) => {
    const code = (c: string) => c.trim().toUpperCase();
    const verdict = checkSalary({
      amount: input.amount,
      currency: input.currency,
      period: input.period,
      residence:
        input.residenceCountry && isCountryCode(input.residenceCountry)
          ? code(input.residenceCountry)
          : null,
      targets: input.targetCountries.filter(isCountryCode).map(code),
      remote: input.remote,
    });
    return JSON.stringify(
      verdict ?? {
        verdict: 'unknown',
        note: 'Not enough information (currency or countries) to judge. Accept it.',
      },
    );
  },
});

// UI control. These only queue an event; the client performs it, so what the
// agent reports back is "asked", not "done".
const navigateParams = z.object({
  page: z.enum(APP_PAGES),
  tab: z
    .enum(['discover', 'saved', 'applied', 'recommended'])
    .nullable()
    .describe(
      'Only for page "jobs" while viewing this search\'s results: which tab to show. Null otherwise.',
    ),
});
export const navigateTool = tool<typeof navigateParams, OrchestratorContext>({
  name: 'navigate',
  description:
    'Take the seeker to a page of the app: home, jobs (search results), applications, career (resume, interview practice), messages, notifications or profile. Use when they ask to go somewhere or open a section ("take me to my profile", "show my saved jobs").',
  parameters: navigateParams,
  execute: (input, runContext) => {
    runContext!.context.events.push({
      type: 'navigate',
      page: input.page,
      ...(input.tab && { tab: input.tab }),
    });
    return JSON.stringify({
      requested: true,
      page: input.page,
      tab: input.tab,
    });
  },
});

const openJobParams = z.object({
  position: z
    .number()
    .int()
    .min(1)
    .max(50)
    .describe('1-based position in the list on screen: "the second job" is 2.'),
});
export const openJobTool = tool<typeof openJobParams, OrchestratorContext>({
  name: 'open_job',
  description:
    'Scroll to and highlight the Nth job in the results list on screen so the seeker can open it. Only works while the results are showing; otherwise tell them to open the results first.',
  parameters: openJobParams,
  execute: (input, runContext) => {
    runContext!.context.events.push({
      type: 'open_job',
      position: input.position,
    });
    return JSON.stringify({ requested: true, position: input.position });
  },
});

const applyFilterParams = z.object({
  remoteType: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).nullable(),
  jobType: z
    .enum(['full', 'part', 'contract', 'intern', 'temporary'])
    .nullable(),
  level: z.enum(['junior', 'mid', 'senior']).nullable(),
  location: z
    .string()
    .nullable()
    .describe('Place text to match in the job location, e.g. "Cairo".'),
  salaryMin: z.number().nullable().describe('Minimum salary shown, in USD.'),
  hasSalary: z
    .boolean()
    .nullable()
    .describe('True: only jobs listing a salary.'),
  postedWithinDays: z.number().int().nullable(),
  salaryCurrencies: z
    .array(z.enum(['USD', 'EUR', 'GBP', 'AED', 'SAR', 'EGP', 'CAD']))
    .max(4)
    .nullable()
    .describe(
      'Only jobs paying in these currencies ("paid in dollars or euros" = ["USD","EUR"]). Jobs with no salary shown are hidden by this.',
    ),
  acceptsCountry: z
    .enum(COUNTRY_CODES)
    .nullable()
    .describe(
      'ISO code of a country the seeker can apply from: hides jobs that only take applicants from elsewhere. Use for "only ones that accept Egypt" (EG), "open to people in Egypt".',
    ),
  sort: z.enum(['best', 'newest', 'salary', 'company']).nullable(),
  q: z
    .string()
    .nullable()
    .describe(
      'Keyword search over title and company. Null leaves it unchanged.',
    ),
});
export const applyFilterTool = tool<
  typeof applyFilterParams,
  OrchestratorContext
>({
  name: 'apply_filter',
  description:
    'Filter or sort the results list on screen without a new search ("only remote", "senior only", "newest first", "with salary"). Set only the fields the seeker asked for, leave the rest null. This narrows the jobs already found; for different jobs or countries start a new search instead.',
  parameters: applyFilterParams,
  execute: (input, runContext) => {
    const { sort, q, salaryCurrencies, ...rest } = input;
    const filters = Object.fromEntries(
      Object.entries({
        ...rest,
        salaryCurrency: salaryCurrencies?.length
          ? salaryCurrencies.join(',')
          : null,
      }).filter(([, v]) => v !== null),
    ) as UiFilters;
    runContext!.context.events.push({
      type: 'apply_filter',
      filters,
      ...(sort && { sort }),
      ...(q && { q }),
    });
    return JSON.stringify({ requested: true, filters, sort, q });
  },
});

const removeFilterParams = z.object({
  keys: z
    .array(z.enum(FILTER_KEYS))
    .nullable()
    .describe(
      'Filters to clear. Null together with all=true clears every one.',
    ),
  all: z.boolean(),
});
export const removeFilterTool = tool<
  typeof removeFilterParams,
  OrchestratorContext
>({
  name: 'remove_filter',
  description:
    'Clear filters on the results list ("remove the on-site filter", "show everything again"). Use all=true to clear all of them.',
  parameters: removeFilterParams,
  execute: (input, runContext) => {
    const keys = input.all || !input.keys?.length ? 'all' : input.keys;
    runContext!.context.events.push({ type: 'remove_filter', keys });
    return JSON.stringify({ requested: true, keys });
  },
});

const proposeApplyParams = z.object({
  positions: z
    .array(z.number().int().min(1).max(50))
    .max(15)
    .nullable()
    .describe('1-based positions of the jobs on screen to apply to.'),
  top: z
    .number()
    .int()
    .min(1)
    .max(15)
    .nullable()
    .describe('Instead of positions: apply to the best N jobs of this search.'),
});
export const proposeApplyTool = tool<
  typeof proposeApplyParams,
  OrchestratorContext
>({
  name: 'propose_apply',
  description:
    'Ask the seeker to confirm applying to jobs ("apply to the first three", "apply to the top 10"). This ONLY opens a confirmation dialog on their screen; nothing is submitted until they press confirm. Never say you applied.',
  parameters: proposeApplyParams,
  execute: (input, runContext) => {
    if (!input.positions?.length && !input.top)
      return JSON.stringify({ requested: false, error: 'Say which jobs.' });
    runContext!.context.events.push({
      type: 'propose_apply',
      ...(input.positions?.length
        ? { positions: input.positions }
        : { top: input.top! }),
    });
    return JSON.stringify({
      requested: true,
      note: 'Confirmation shown to the seeker. Nothing has been submitted.',
    });
  },
});

// Paths the assistant may open. Anything else is refused.
export const APP_PATH =
  /^\/(jobs(\/[0-9a-f]{24})?|applications(\/[0-9a-f]{24})?|career(\/interviews(\/[0-9a-f]{24})?|\/skills)?|messages|notifications|profile)?$/;

const gotoParams = z.object({
  more: z
    .boolean()
    .describe(
      'Default false. True ONLY when what the user asked for cannot be finished without one more click on the page you are opening now (e.g. open /career, then press "New conversation"). Opening a page the user asked to see, or pressing the button they asked for, is the end: false.',
    ),
  path: z
    .string()
    .describe(
      'App path, e.g. "/jobs/<search id>" for a past search (ids are listed under "Your searches"), "/career/interviews", "/career/skills", "/applications".',
    ),
});
export const gotoTool = tool<typeof gotoParams, OrchestratorContext>({
  name: 'open_path',
  description:
    'Open any page of the app by path, for example a past search from the "Your searches" list ("open my latest search"), mock interviews, skills gap, an application. Prefer this over click_element when you know the path.',
  parameters: gotoParams,
  execute: (input, runContext) => {
    if (!APP_PATH.test(input.path))
      return JSON.stringify({ requested: false, error: 'Not an app page.' });
    runContext!.context.events.push({
      type: 'goto',
      path: input.path,
      more: input.more,
    });
    return JSON.stringify({
      requested: true,
      path: input.path,
      note: 'Page action queued. Do NOT call another page action this turn: its ids belong to the old page. Reply with one short sentence; if more=true the app sends you the new page next.',
    });
  },
});

const clickParams = z.object({
  more: z
    .boolean()
    .describe(
      'Default false. True ONLY when what the user asked for cannot be finished without one more click on the page you are opening now (e.g. open /career, then press "New conversation"). Opening a page the user asked to see, or pressing the button they asked for, is the end: false.',
    ),
  elementId: z
    .string()
    .describe('The id of a control in the "Page map" (like "e12").'),
});
export const clickTool = tool<typeof clickParams, OrchestratorContext>({
  name: 'click_element',
  description:
    'Click a link, button or tab from the Page map, like a person would. Use it for anything on the page you can see in the map (open a section, switch a tab, press a button). It cannot confirm applying: a confirmation dialog always appears for the seeker.',
  parameters: clickParams,
  execute: (input, runContext) => {
    runContext!.context.events.push({
      type: 'click',
      elementId: input.elementId,
      more: input.more,
    });
    return JSON.stringify({
      requested: true,
      elementId: input.elementId,
      note: 'Page action queued. Do NOT call another page action this turn: its ids belong to the old page. Reply with one short sentence; if more=true the app sends you the new page next.',
    });
  },
});

const typeParams = z.object({
  more: z
    .boolean()
    .describe(
      'Default false. True ONLY when what the user asked for cannot be finished without one more click on the page you are opening now (e.g. open /career, then press "New conversation"). Opening a page the user asked to see, or pressing the button they asked for, is the end: false.',
    ),
  elementId: z.string().describe('The id of an input from the Page map.'),
  text: z.string().max(500),
});
export const typeTextTool = tool<typeof typeParams, OrchestratorContext>({
  name: 'type_text',
  description:
    'Type text into a text field from the Page map (search box, form field). It only fills the field; the seeker presses any save or submit button themselves unless you click it for a harmless action like search.',
  parameters: typeParams,
  execute: (input, runContext) => {
    runContext!.context.events.push({
      type: 'type_text',
      elementId: input.elementId,
      text: input.text,
      more: input.more,
    });
    return JSON.stringify({
      requested: true,
      elementId: input.elementId,
      note: 'Page action queued. Do NOT call another page action this turn: its ids belong to the old page. Reply with one short sentence; if more=true the app sends you the new page next.',
    });
  },
});

const describeParams = z.object({
  page: z.enum(PAGE_KEYS).describe('A page key from "The app" list.'),
});
export const describePageTool = tool<
  typeof describeParams,
  OrchestratorContext
>({
  name: 'describe_page',
  description:
    'Read the map of any page of the app: what it is for and every control with its exact name (like career.new-conversation). Use it before acting on a page you are not on, or to answer "what can I do in X". It does not move the user.',
  parameters: describeParams,
  execute: (input) => JSON.stringify(PAGES[input.page]),
});

const extensionProgressParams = z.object({ show: z.boolean() });
export const getExtensionProgressTool = tool<typeof extensionProgressParams, OrchestratorContext>({
  name: 'get_extension_progress',
  description:
    "What the Plato browser extension is doing right now for the seeker: whether it is online, how many jobs are waiting / being applied / need the seeker / submitted / failed / skipped, and the latest jobs with their state and note. Use it for any question about the extension or about applications it is working on. Set show to true when the seeker asks to SEE the progress: it opens the progress sidebar. Report only what this returns; never guess.",
  parameters: extensionProgressParams,
  execute: async ({ show }, runContext) => {
    const ctx = runContext!.context;
    if (show) ctx.events.push({ type: 'open_extension_progress' });
    return ctx.extensionProgress();
  },
});

export const orchestratorTools = [
  getExtensionProgressTool,
  describePageTool,
  gotoTool,
  clickTool,
  typeTextTool,
  proposeApplyTool,
  // navigateTool stays exported for its test; open_path + click cover navigation with a visible cursor.
  openJobTool,
  applyFilterTool,
  removeFilterTool,
  askUserQuestionsTool,
  checkSalaryTool,
  startJobSearchTool,
  getSearchStatusTool,
  getApplicationReadinessTool,
  saveApplicationDetailsTool,
];
