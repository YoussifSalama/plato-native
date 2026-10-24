import type { JobFilters, SearchCard, SearchJob } from '../core/types';
import { icon } from './icons';
import { dropdown } from './dropdown';
import { h } from './view';

// Pure rendering of the first-run wizard: state in, DOM out (textContent only).
export const SEARCH_PAGE_SIZE = 4; // 2 x 2 cards
export const MAX_TABS = 10; // tabs open at once; more jobs run in rounds
export const MAX_JOBS = 50; // same cap as the server's batch
export const JOBS_PAGE_SIZE = 6; // rows per page in the jobs step (the server pages)

export interface Wizard {
  step: 'welcome' | 'search' | 'jobs' | 'consent';
  searches: SearchCard[];
  searchPage: number;
  searchId?: string;
  jobs: SearchJob[]; // the current page, filtered and sorted by the server
  jobsTotal: number; // matches for the current filters, all pages
  sources: { value: string; count: number }[];
  filters: JobFilters;
  picked: string[]; // ids ticked on any page
  jobsPage: number;
  declining: boolean;
  declineReason: string;
  autoSubmit: boolean; // the seeker lets Plato press Submit for this run
  resumeMode: 'profile' | 'tailored'; // what goes into resume upload fields for this run
  existing?: boolean; // the jobs are already queued: Allow only starts them
  waiting?: number; // welcome: jobs already in the queue (added on Plato)
  sites?: string[]; // welcome: sites Plato can fill right now
}
export type WizardAction =
  | { type: 'continue' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'page'; page: number }
  | { type: 'jobs-page'; page: number }
  | { type: 'filter'; patch: Partial<JobFilters> }
  | { type: 'pick-matching' }
  | { type: 'pick-search'; id: string }
  | { type: 'toggle-job'; id: string }
  | { type: 'pick-all' }
  | { type: 'pick-none' }
  | { type: 'allow' }
  | { type: 'decline'; reason: string }
  | { type: 'declining'; on: boolean }
  | { type: 'auto-submit'; on: boolean }
  | { type: 'resume-mode'; mode: 'profile' | 'tailored' }
  | { type: 'resume' }; // start jobs that are already queued

// Same card head as the Ready card: icon tile, title, one line under it.
function head(doc: Document, ico: Parameters<typeof icon>[1], title: string, sub?: string) {
  return h(doc, 'div', { class: 'ready-head' }, h(doc, 'span', { class: 'ready-ico' }, icon(doc, ico)), h(doc, 'div', {}, h(doc, 'h2', { text: title }), sub ? h(doc, 'p', { class: 'meta', text: sub }) : null));
}

export const rounds = (jobs: number) => Math.ceil(jobs / MAX_TABS);
const STEPS = ['search', 'jobs', 'consent'] as const;

export function renderWizard(doc: Document, host: HTMLElement, w: Wizard, send: (a: WizardAction) => void, busy: boolean) {
  // one wrapper: short steps sit in the vertical middle instead of leaving the lower half empty
  const root = h(doc, 'div', { class: 'wiz ready' }); // every step is one card, like the Ready card
  host.append(root);
  if (w.step === 'welcome') {
    const n = w.waiting ?? 0;
    const step = (num: number, title: string, sub: string) => h(doc, 'li', {}, h(doc, 'span', { class: 'num', text: String(num) }), h(doc, 'span', {}, h(doc, 'strong', { text: title }), h(doc, 'span', { class: 'meta', text: sub })));
    const row = (ico: Parameters<typeof icon>[1], label: string, value: string) => h(doc, 'div', { class: 'srow' }, icon(doc, ico), h(doc, 'span', { class: 'slabel', text: label }), h(doc, 'span', { class: 'sval', text: value }));
    root.append(
      h(doc, 'div', { class: 'welcome' },
        h(doc, 'div', { class: 'success-ring' }, h(doc, 'span', { class: 'check', text: '✓' })),
        h(doc, 'h1', { text: 'You’re linked!' }),
        h(doc, 'p', { text: 'This browser is connected to your Plato account. Plato applies in your own browser, and you can watch every step.' })),
      h(doc, 'div', { class: 'srows' },
        row('briefcase', 'Jobs waiting', n ? `${n} from Plato` : 'None yet'),
        row('layers', 'Sites Plato can fill', w.sites?.length ? w.sites.join(', ') : '…'),
        row('send', 'You stay in control', 'Pause or stop anytime')),
      h(doc, 'p', { class: 'eyebrow', text: 'How it works' }),
      h(doc, 'ol', { class: 'steps' },
        step(1, 'Pick the jobs', 'From a search here, or with “Apply with Plato” on the website.'),
        step(2, 'Plato fills the forms', 'In background tabs grouped as “Plato”, a few at a time.'),
        step(3, 'You only step in when needed', 'A sign-in, a captcha, or an answer only you know.')),
      n
        ? h(doc, 'button', { class: 'primary block cta', id: 'welcome-go', onclick: () => send({ type: 'skip' }) }, `Review ${n} waiting job${n === 1 ? '' : 's'}`, icon(doc, 'arrow', 'ico inline'))
        : h(doc, 'button', { class: 'primary block cta', id: 'welcome-go', onclick: () => send({ type: 'continue' }) }, 'Choose jobs from a search', icon(doc, 'arrow', 'ico inline')),
    );
    if (n) root.append(h(doc, 'button', { class: 'block soft', text: 'Choose from a search instead', onclick: () => send({ type: 'continue' }) }));
    return;
  }

  const idx = STEPS.indexOf(w.step);
  const dots = h(doc, 'div', { class: 'stepper', id: 'stepper' });
  STEPS.forEach((s, i) => {
    dots.append(h(doc, 'span', { class: `step${i === idx ? ' on' : i < idx ? ' done' : ''}`, text: `${i + 1}` }));
    if (i < STEPS.length - 1) dots.append(h(doc, 'span', { class: `bar${i < idx ? ' done' : ''}` }));
  });
  root.append(dots);
  if (w.step === 'search') searchStep(doc, root, w, send, busy);
  else if (w.step === 'jobs') jobsStep(doc, root, w, send, busy);
  else consentStep(doc, root, w, send, busy);
}

function searchStep(doc: Document, root: HTMLElement, w: Wizard, send: (a: WizardAction) => void, busy: boolean) {
  root.append(
    head(doc, 'target', 'Which search should Plato apply on?', 'Plato applies to jobs from this search. Searches with jobs you added on Plato come first, then the newest.'),
  );
  const link = h(doc, 'a', { class: 'ext-link', text: 'Not sure which one? Open your searches on Plato', href: `${__WEB_ORIGIN__}/jobs` });
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noreferrer');
  link.setAttribute('title', 'Opens your Jobs page on Plato. Tick the checkbox next to a search in your history to mark it Featured.');
  root.append(link);

  if (!w.searches.length) {
    root.append(h(doc, 'p', { class: 'empty', text: 'No searches yet. Search for jobs on Plato first, then come back.' }));
    return;
  }
  const pages = Math.ceil(w.searches.length / SEARCH_PAGE_SIZE);
  const page = Math.min(w.searchPage, pages - 1);
  const grid = h(doc, 'div', { class: 'cards', id: 'search-cards' });
  for (const c of w.searches.slice(page * SEARCH_PAGE_SIZE, (page + 1) * SEARCH_PAGE_SIZE)) {
    const card = h(doc, 'button', { class: `scard${c.id === w.searchId ? ' sel' : ''}`, onclick: () => send({ type: 'pick-search', id: c.id }) },
      c.queued ? h(doc, 'span', { class: 'tag plato', text: `${c.queued} added from Plato` }) : null,
      c.featured ? h(doc, 'span', { class: 'tag', text: '★ Featured' }) : null,
      h(doc, 'strong', { text: c.title }),
      h(doc, 'span', { class: 'meta', text: [c.locations.join(', '), c.remote && c.remote !== 'any' ? c.remote : ''].filter(Boolean).join(' · ') || 'Anywhere' }),
      h(doc, 'span', { class: 'meta', text: `${c.job_count} jobs · ${new Date(c.created_at).toLocaleDateString()}` }));
    card.setAttribute('aria-pressed', String(c.id === w.searchId));
    if (c.featured) card.setAttribute('title', 'You starred this search on Plato');
    grid.append(card);
  }
  root.append(grid);
  if (pages > 1) {
    const pager = h(doc, 'div', { class: 'pager', id: 'pager' });
    for (let i = 0; i < pages; i++) {
      const d = h(doc, 'button', { class: `dot${i === page ? ' on' : ''}`, onclick: () => send({ type: 'page', page: i }) });
      d.setAttribute('aria-label', `Page ${i + 1} of ${pages}`);
      d.setAttribute('aria-current', String(i === page));
      pager.append(d);
    }
    root.append(pager);
  }
  // The picked search, spelled out: what Plato will apply from if you continue.
  const sel = w.searches.find((c) => c.id === w.searchId);
  if (sel) {
    const row = (ico: Parameters<typeof icon>[1], label: string, value: string) => h(doc, 'div', { class: 'srow' }, icon(doc, ico), h(doc, 'span', { class: 'slabel', text: label }), h(doc, 'span', { class: 'sval', text: value }));
    root.append(
      h(doc, 'p', { class: 'eyebrow', text: 'Selected search' }),
      h(doc, 'div', { class: 'srows picked' },
        row('target', 'Search', sel.title),
        row('sliders', 'Where', [sel.locations.join(', ') || 'Anywhere', sel.remote && sel.remote !== 'any' ? sel.remote : ''].filter(Boolean).join(' · ')),
        row('briefcase', 'Jobs found', `${sel.job_count}`),
        row('gauge', 'Searched on', new Date(sel.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))),
      h(doc, 'p', { class: 'meta', text: `Next you pick which of its ${sel.job_count} jobs to apply to. Jobs you added from Plato are ticked for you.` }),
    );
  }
  root.append(h(doc, 'div', { class: 'nav' }, h(doc, 'button', { class: 'primary block cta', text: sel ? `Continue with “${sel.title}”` : 'Continue', disabled: busy || !w.searchId, onclick: () => send({ type: 'continue' }) })));
}

const SORTS: [string, string][] = [['best', 'Best match'], ['newest', 'Newest'], ['salary', 'Salary'], ['company', 'Company']];
const REMOTE: [string, string][] = [['', 'Any setup'], ['REMOTE', 'Remote'], ['HYBRID', 'Hybrid'], ['ONSITE', 'On-site']];
const TYPES: [string, string][] = [['', 'Any type'], ['full', 'Full-time'], ['part', 'Part-time'], ['contract', 'Contract'], ['intern', 'Internship'], ['temporary', 'Temporary']];
const LEVELS: [string, string][] = [['', 'Any level'], ['junior', 'Junior'], ['mid', 'Mid'], ['senior', 'Senior']];
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
// ponytail: a letter badge per platform, colour from the name; real logos when we ship image assets
const platoChip = (doc: Document, on: boolean, onclick: () => void) => {
  const b = h(doc, 'button', { class: `pchip${on ? ' on' : ''}`, id: 'f-plato', text: 'From Plato', onclick });
  b.setAttribute('aria-pressed', String(on));
  return b;
};
const tint = (s: string) => `hsl(${[...s].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 55% 45%)`;

// The panel's themed dropdown (a native <select> list cannot be styled): see dropdown.ts.
function select(doc: Document, id: string, opts: [string, string][], value: string, onChange: (v: string) => void) {
  return dropdown(doc, id, opts, value, onChange);
}

function jobsStep(doc: Document, root: HTMLElement, w: Wizard, send: (a: WizardAction) => void, busy: boolean) {
  root.append(
    head(doc, 'briefcase', 'Choose the jobs', `Jobs you added from Plato are already ticked. Search and filter to find others (up to ${MAX_JOBS} in total).`),
  );
  // Filters run on the server, exactly like the Jobs page on Plato.
  const q = h(doc, 'input', { id: 'job-q', type: 'text', placeholder: 'Search title or company…', maxlength: 100, autocomplete: 'off' });
  q.value = w.filters.q ?? '';
  q.addEventListener('keydown', (e) => e.key === 'Enter' && send({ type: 'filter', patch: { q: q.value.trim() || undefined } }));
  q.addEventListener('change', () => send({ type: 'filter', patch: { q: q.value.trim() || undefined } }));
  const f = w.filters;
  root.append(
    h(doc, 'div', { class: 'filters', id: 'filters' }, q,
      select(doc, 'f-sort', SORTS, f.sort ?? 'best', (v) => send({ type: 'filter', patch: { sort: v as JobFilters['sort'] } })),
      select(doc, 'f-source', [['', 'All sources'], ...w.sources.map((s): [string, string] => [s.value, `${label(s.value)} (${s.count})`])], f.source ?? '', (v) => send({ type: 'filter', patch: { source: v || undefined } })),
      select(doc, 'f-remote', REMOTE, f.remoteType ?? '', (v) => send({ type: 'filter', patch: { remoteType: (v || undefined) as JobFilters['remoteType'] } })),
      select(doc, 'f-type', TYPES, f.jobType ?? '', (v) => send({ type: 'filter', patch: { jobType: (v || undefined) as JobFilters['jobType'] } })),
      select(doc, 'f-level', LEVELS, f.level ?? '', (v) => send({ type: 'filter', patch: { level: (v || undefined) as JobFilters['level'] } }))),
  );
  root.append(h(doc, 'div', { class: 'tools' },
    h(doc, 'button', { class: 'link', text: `Select all ${Math.min(w.jobsTotal, MAX_JOBS)} matching`, disabled: busy || !w.jobsTotal, onclick: () => send({ type: 'pick-matching' }) }),
    h(doc, 'button', { class: 'link', text: 'Select none', onclick: () => send({ type: 'pick-none' }) }),
    platoChip(doc, !!f.fromPlato, () => send({ type: 'filter', patch: { fromPlato: f.fromPlato ? undefined : true } })),
    h(doc, 'span', { class: 'count', id: 'count', text: `${w.picked.length} selected · ${w.jobsTotal} job${w.jobsTotal === 1 ? '' : 's'}` })));
  if (!w.jobs.length) root.append(h(doc, 'p', { class: 'empty', text: 'No jobs match these filters.' }));
  const pages = Math.max(1, Math.ceil(w.jobsTotal / JOBS_PAGE_SIZE));
  const page = Math.min(w.jobsPage, pages - 1);
  const table = h(doc, 'div', { class: 'jobs', id: 'jobs' });
  for (const j of w.jobs) {
    const on = w.picked.includes(j.id);
    const row = h(doc, 'label', { class: `jrow${j.applyable ? '' : ' off'}` });
    const box = h(doc, 'input', { type: 'checkbox' });
    box.checked = on;
    if (!j.applyable) {
      box.disabled = true;
      row.setAttribute('title', 'Plato can’t fill applications on this site yet, or you already applied.');
    } else box.addEventListener('change', () => send({ type: 'toggle-job', id: j.id }));
    // where it came from: the board, and the site Plato fills when that is somewhere else
    const site = j.site && j.site.toUpperCase() !== j.source.toUpperCase() ? ` → ${label(j.site)}` : '';
    const logo = h(doc, 'span', { class: 'logo', text: j.source.charAt(0) });
    logo.style.background = tint(j.source);
    logo.title = label(j.source);
    const match = j.match ? h(doc, 'span', { class: `match${j.match >= 75 ? ' hi' : ''}`, text: `${Math.round(j.match)}%` }) : null;
    match?.setAttribute('title', 'Your match on Plato');
    row.append(
      box,
      logo,
      h(doc, 'span', { class: 'jtext' },
        h(doc, 'strong', { text: j.title }),
        h(doc, 'span', { class: 'meta', text: [j.company, j.location].filter(Boolean).join(' · ') }),
        h(doc, 'span', { class: 'meta', text: `via ${label(j.source)}${site}` }),
        h(doc, 'span', { class: 'tags' },
          j.queued ? h(doc, 'span', { class: 'tag plato', text: 'From Plato' }) : null,
          j.applyable ? null : h(doc, 'span', { class: 'tag', text: 'Not available' }))),
    );
    if (match) row.append(match);
    table.append(row);
  }
  root.append(table);
  if (pages > 1) {
    root.append(h(doc, 'div', { class: 'pager', id: 'jobs-pager' },
      h(doc, 'button', { class: 'link', text: '‹ Prev', disabled: busy || page === 0, onclick: () => send({ type: 'jobs-page', page: page - 1 }) }),
      h(doc, 'span', { class: 'count', text: `Page ${page + 1} of ${pages}` }),
      h(doc, 'button', { class: 'link', text: 'Next ›', disabled: busy || page >= pages - 1, onclick: () => send({ type: 'jobs-page', page: page + 1 }) })));
  }
  root.append(h(doc, 'div', { class: 'nav' },
    h(doc, 'button', { text: 'Back', disabled: busy, onclick: () => send({ type: 'back' }) }),
    h(doc, 'button', { class: 'primary', text: `Continue with ${w.picked.length}`, disabled: busy || !w.picked.length, onclick: () => send({ type: 'continue' }) })));
}

function consentStep(doc: Document, root: HTMLElement, w: Wizard, send: (a: WizardAction) => void, busy: boolean) {
  const n = w.picked.length;
  const tabs = Math.min(n, MAX_TABS);
  const r = rounds(n);
  root.append(head(doc, 'layers', 'Allow Plato to open tabs?', `Plato will work on ${n} job${n === 1 ? '' : 's'}, ${tabs} at a time${r > 1 ? `, in ${r} rounds` : ''}. Each job gets its own browser tab, grouped together as “Plato”.`));
  const row = (ico: Parameters<typeof icon>[1], label: string, value: Node | string) =>
    h(doc, 'div', { class: 'srow' }, icon(doc, ico), h(doc, 'span', { class: 'slabel', text: label }), typeof value === 'string' ? h(doc, 'span', { class: 'sval', text: value }) : value);
  // the resume for every upload field in this run: the profile's, or one built for each job
  const resumeSel = select(doc, 'resume-mode', [['profile', 'My profile resume'], ['tailored', 'One built for each job']], w.resumeMode, (v) => send({ type: 'resume-mode', mode: v as 'profile' | 'tailored' }));
  const resumeRow = row('file', 'Resume to upload', resumeSel);
  resumeRow.setAttribute('title', 'Uploaded first on every form, before anything else is filled. "One built for each job" uses Plato\'s resume builder with the job\'s requirements and the country\'s format.');
  root.append(
    h(doc, 'div', { class: 'srows' },
      row('briefcase', 'Jobs', h(doc, 'span', { class: 'sval big', text: String(n) })),
      row('layers', 'At a time', `${tabs} tab${tabs === 1 ? '' : 's'}${r > 1 ? ` · ${r} rounds` : ''}`),
      resumeRow),
    h(doc, 'p', { class: 'notice', text: 'Plato fills the forms and presses Submit for you. It stops only for something it can’t answer.' }),
  );
  if (w.declining) {
    const reason = h(doc, 'textarea', { id: 'reason', placeholder: 'Why not? (required) For example: security worries, wrong jobs…', maxlength: 500 });
    reason.value = w.declineReason;
    reason.addEventListener('input', () => (w.declineReason = reason.value));
    root.append(
      h(doc, 'p', { class: 'meta', text: 'Tell us why. Your reason is saved so we can fix problems and understand your concerns.' }),
      reason,
      h(doc, 'div', { class: 'nav' },
        h(doc, 'button', { text: 'Cancel', disabled: busy, onclick: () => send({ type: 'declining', on: false }) }),
        h(doc, 'button', { class: 'primary', text: 'Send and decline', disabled: busy, onclick: () => send({ type: 'decline', reason: reason.value }) })),
    );
    return;
  }
  root.append(
    h(doc, 'button', { class: 'primary block cta', text: 'Allow', disabled: busy, onclick: () => send({ type: 'allow' }) }),
    h(doc, 'div', { class: 'nav split' },
      h(doc, 'button', { text: 'Back', disabled: busy, onclick: () => send({ type: 'back' }) }),
      h(doc, 'button', { class: 'soft', text: 'Decline', disabled: busy, onclick: () => send({ type: 'declining', on: true }) })),
  );
}
