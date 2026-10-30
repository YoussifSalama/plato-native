import { MAX_BATCH_JOBS } from '../core/batch-runner';
import type { ApiItem, SearchJob } from '../core/types';
import type { Registry } from '../providers/registry';
import { icon } from './icons';
import { avatar, banner, btn, h, type Actions, type PanelState, type PickKey } from './view';

// The Jobs view: what the seeker can put in the next batch. Two sources, one selection (up to MAX_BATCH_JOBS):
// jobs already queued from the Plato web app (server items, PENDING), and the jobs of one of the seeker's searches.
// The dock at the bottom always shows the count against the cap; the sheet is the one confirmation before a batch runs.
export const JOBS_PAGE_SIZE = 20;

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
export const canStart = (i: ApiItem, s: PanelState, registry: Registry) => !!i.provider && registry.policyOf(i.provider, s.policy) === 'FILL_ONLY' && !!registry.get(i.provider)?.adapter;
export const blockedWhy = (i: ApiItem, s: PanelState, registry: Registry) => (!i.provider || registry.policyOf(i.provider, s.policy) !== 'FILL_ONLY' ? 'Not available: this site is not enabled for Plato yet.' : 'Not available yet: nothing is built for this site.');
/** Queued on Plato: waiting server items that are not part of the batch running now. */
export const queuedItems = (s: PanelState) => s.items.filter((i) => i.state === 'PENDING' && !(s.run && s.run.status === 'running' && s.run.itemIds.includes(i.id)));
/** Waiting jobs of the newest pick only: what is pre-ticked when the panel opens on an empty selection. */
export function latestBatch(items: ApiItem[], ok: (i: ApiItem) => boolean = () => true) {
  const pending = items.filter((i) => i.state === 'PENDING' && ok(i));
  const newest = pending.reduce<ApiItem | null>((b, i) => (!b || (i.batch?.created_at ?? '') > (b.batch?.created_at ?? '') ? i : b), null);
  return newest ? pending.filter((i) => i.batch_id === newest.batch_id) : [];
}
export const pickMeta = (key: PickKey, s: PanelState) => {
  if (key.startsWith('item:')) {
    const i = s.items.find((x) => x.id === key.slice(5));
    return i ? { title: i.job?.title ?? 'Job', company: i.job?.company ?? '', via: i.provider ? label(i.provider) : '' } : null;
  }
  const j = s.jobs.known[key.slice(4)];
  return j ? { title: j.title, company: j.company, via: label(j.site ?? j.source) } : null;
};

function row(doc: Document, o: { key: PickKey; title: string; company: string; where: string; via: string; match?: number | null; fromPlato?: boolean; off?: string | null; on: boolean; locked: boolean; extra?: Node | null }, a: Actions, busy: boolean) {
  const el = h(doc, 'div', { class: `job${o.on ? ' sel' : ''}${o.off || o.locked ? ' off' : ''}`, attrs: { role: 'checkbox', 'aria-checked': String(o.on), 'aria-disabled': String(!!(o.off || o.locked)), tabindex: '0', 'data-key': o.key } });
  const t = h(doc, 'span', { class: 't' }, h(doc, 'strong', { text: o.title }), h(doc, 'span', { text: [o.company, o.where].filter(Boolean).join(' · ') }));
  if (o.off) t.append(h(doc, 'span', { class: 'why', text: o.off }));
  else t.append(h(doc, 'span', {}, `via ${o.via}`, o.fromPlato ? h(doc, 'span', { class: 'tagp', text: 'From Plato' }) : null));
  el.append(h(doc, 'span', { class: 'ck' }, icon(doc, 'check')), avatar(doc, o.company), t);
  if (o.match) el.append(h(doc, 'span', { class: `match num${o.match >= 85 ? ' hi' : ''}`, text: `${Math.round(o.match)}%`, attrs: { title: 'Your match on Plato' } }));
  else if (o.extra) el.append(o.extra);
  else el.append(h(doc, 'span'));
  const act = () => {
    if (busy) return;
    if (o.locked) return a.jobs.toggle(o.key); // the action says why (a batch is running)
    if (o.off) return;
    a.jobs.toggle(o.key);
  };
  el.addEventListener('click', (e) => !(e.target as HTMLElement).closest('button') && act());
  el.addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), act()));
  return el;
}

export function renderJobs(doc: Document, s: PanelState, a: Actions, registry: Registry): Node[] {
  const out: Node[] = [];
  const j = s.jobs;
  const running = !!s.run && s.run.status === 'running';
  if (running) out.push(banner(doc, 'info', 'layers', 'A batch is running', 'You can browse, but new jobs wait until it finishes. ', btn(doc, 'See progress', () => a.view('batch'), 'btn ghost sm')));

  // queued on Plato
  const queued = queuedItems(s);
  if (queued.length) {
    out.push(h(doc, 'div', { class: 'sect' }, 'Queued on Plato', h(doc, 'span', { class: 'n num', text: `· ${queued.length}` })));
    const list = h(doc, 'div', { class: 'jobs', id: 'queued' });
    for (const i of queued) {
      const key: PickKey = `item:${i.id}`;
      const remove = h(doc, 'button', { class: 'btn ghost sm', type: 'button', text: 'Remove', disabled: s.busy, onclick: () => a.jobs.dropItem(i.id), attrs: { 'aria-label': `Remove ${i.job?.title ?? 'job'} from the queue` } });
      list.append(row(doc, { key, title: i.job?.title ?? 'Job', company: i.job?.company ?? '', where: i.batch?.label ? `“${i.batch.label}” search` : 'Picked on Plato', via: i.provider ? (registry.get(i.provider)?.label ?? i.provider) : '', off: canStart(i, s, registry) ? null : blockedWhy(i, s, registry), on: j.picked.includes(key), locked: running, extra: remove }, a, !!s.busy));
    }
    out.push(list);
  }

  // one of the seeker's searches
  const sel = j.searches.find((c) => c.id === j.searchId);
  const picker = h(doc, 'button', { class: 'picker', type: 'button', id: 'picker', onclick: () => a.jobs.picker(!j.pickerOpen), attrs: { 'aria-expanded': String(j.pickerOpen), 'aria-haspopup': 'listbox' } },
    h(doc, 'span', { class: 'pico' }, icon(doc, 'target')),
    h(doc, 'span', { class: 't' },
      h(doc, 'strong', { text: sel ? sel.title : j.searches.length ? 'Choose a search' : 'No searches yet' }),
      h(doc, 'span', { text: sel ? [sel.locations.join(', ') || 'Anywhere', sel.remote && sel.remote !== 'any' ? sel.remote : '', `${sel.job_count} jobs`, `searched ${new Date(sel.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · ') : 'Search for jobs on Plato, then pick them here.' })),
    icon(doc, 'chev', 'ico chev'));
  out.push(h(doc, 'div', { class: 'sect' }, queued.length ? 'From a search' : 'Your searches'), picker);
  if (j.pickerOpen) {
    const list = h(doc, 'div', { class: 'plist', id: 'search-list', attrs: { role: 'listbox' } });
    for (const c of j.searches)
      list.append(h(doc, 'button', { type: 'button', onclick: () => a.jobs.pickSearch(c.id), attrs: { role: 'option', 'aria-selected': String(c.id === j.searchId) } }, icon(doc, 'target'),
        h(doc, 'span', { class: 'pt' }, h(doc, 'strong', { text: c.title }), h(doc, 'span', { text: [c.locations.join(', ') || 'Anywhere', c.queued ? `${c.queued} added from Plato` : '', c.featured ? '★ Featured' : ''].filter(Boolean).join(' · ') })),
        h(doc, 'span', { class: 'count num', text: String(c.job_count) })));
    const link = h(doc, 'a', { text: 'Run a new search on Plato ↗', href: `${__WEB_ORIGIN__}/jobs` });
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noreferrer');
    list.append(link);
    out.push(list);
  }
  if (sel) {
    const q = h(doc, 'input', { id: 'job-q', type: 'search', placeholder: 'Search title or company', maxlength: 100, autocomplete: 'off' });
    q.value = j.q;
    const go = () => q.value.trim() !== j.q && a.jobs.filter({ q: q.value.trim() });
    q.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    q.addEventListener('change', go);
    const chip = (on: boolean, text: string, fn: () => void, id: string) => h(doc, 'button', { class: `chip${on ? ' on' : ''}`, type: 'button', text, id, onclick: fn, attrs: { 'aria-pressed': String(on) } });
    const fromPlato = sel.queued ?? 0;
    out.push(h(doc, 'div', { class: 'filters' },
      h(doc, 'label', { class: 'search' }, icon(doc, 'search'), q),
      chip(j.sort === 'newest', 'Newest first', () => a.jobs.filter({ sort: j.sort === 'newest' ? 'best' : 'newest' }), 'f-sort'),
      chip(j.remote, 'Remote', () => a.jobs.filter({ remote: !j.remote }), 'f-remote'),
      fromPlato ? chip(j.fromPlato, `From Plato · ${fromPlato}`, () => a.jobs.filter({ fromPlato: !j.fromPlato }), 'f-plato') : null));
    const room = MAX_BATCH_JOBS - j.picked.length;
    const pickable = j.jobs.filter((x) => x.applyable && !x.queued && !j.picked.includes(`job:${x.id}`)).length;
    out.push(h(doc, 'div', { class: 'lhead' }, h(doc, 'span', { class: 'n num', id: 'count', text: j.loading && !j.jobs.length ? 'Loading…' : `${j.jobsTotal} job${j.jobsTotal === 1 ? '' : 's'}` }),
      !running && pickable && room > 0 ? btn(doc, `Select ${Math.min(room, pickable)} on this page`, a.jobs.selectVisible, 'btn ghost sm', { id: 'select-visible' }) : null));
    const list = h(doc, 'div', { class: 'jobs', id: 'jobs' });
    if (j.loading && !j.jobs.length) list.append(h(doc, 'div', { class: 'skel' }), h(doc, 'div', { class: 'skel' }), h(doc, 'div', { class: 'skel' }));
    else if (!j.jobs.length) list.append(h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico' }, icon(doc, 'search')), h(doc, 'h3', { text: 'No jobs match' }), h(doc, 'p', { text: 'Try another search, or clear the filters.' }), btn(doc, 'Clear filters', () => a.jobs.filter({ q: '', remote: false, fromPlato: false }), 'btn soft')));
    for (const x of j.jobs) list.append(jobRow(doc, x, s, a, running));
    out.push(list);
    if (j.jobs.length < j.jobsTotal) out.push(btn(doc, j.loading ? 'Loading…' : `Show more (${j.jobsTotal - j.jobs.length} left)`, a.jobs.more, 'btn block', { disabled: s.busy || j.loading, id: 'more' }));
  } else if (!j.searches.length && !queued.length) {
    out.push(h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico' }, icon(doc, 'inbox')), h(doc, 'h3', { text: 'Nothing to pick from yet' }), h(doc, 'p', { text: 'Search for jobs on Plato, or add jobs with “Apply with Plato” there. They show up here.' })));
  }
  return out;
}
function jobRow(doc: Document, x: SearchJob, s: PanelState, a: Actions, running: boolean) {
  const key: PickKey = `job:${x.id}`;
  const site = x.site && x.site.toUpperCase() !== x.source.toUpperCase() ? `${label(x.source)} → ${label(x.site)}` : label(x.source);
  return row(doc, { key, title: x.title, company: x.company, where: x.location ?? '', via: site, match: x.match, fromPlato: !!x.queued, off: x.queued ? 'Queued on Plato already (above).' : x.applyable ? null : 'Plato can’t fill this site yet, or you already applied.', on: s.jobs.picked.includes(key), locked: running }, a, !!s.busy);
}

/** The dock: the selection against the cap, or the running batch's progress. Always in view. */
export function renderDock(doc: Document, s: PanelState, a: Actions) {
  const n = s.jobs.picked.length;
  const dock = h(doc, 'div', { class: 'dock', id: 'dock' });
  if (s.run && s.run.status === 'running') {
    const done = s.rows.filter((r) => !!r.outcome).length;
    const needs = s.rows.filter((r) => r.status === 'needs' || r.status === 'verify' || r.status === 'interrupted').length;
    dock.append(
      h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'cnt num' }, String(done), h(doc, 'small', { text: ` / ${s.run.itemIds.length}` })),
        h(doc, 'span', { class: 'lbl' }, h(doc, 'b', { text: needs ? `${needs} job${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you` : 'Batch running' }), needs ? 'Answer on the Batch view to continue.' : 'No second batch until this one finishes.'),
        btn(doc, needs ? 'Answer' : 'Progress', () => a.view('batch'), needs ? 'btn primary' : 'btn soft')),
      h(doc, 'div', { class: 'cap' }, ...s.run.itemIds.map((id) => h(doc, 'i', { class: s.rows.find((r) => r.itemId === id)?.outcome ? 'on' : '' }))));
    return dock;
  }
  dock.append(
    h(doc, 'div', { class: 'row' }, h(doc, 'span', { class: 'cnt num', id: 'picked' }, String(n), h(doc, 'small', { text: ` / ${MAX_BATCH_JOBS}` })),
      h(doc, 'span', { class: 'lbl' }, h(doc, 'b', { text: n ? `${n} job${n === 1 ? '' : 's'} selected` : 'Pick jobs to apply to' }), n >= MAX_BATCH_JOBS ? 'Batch is full. Remove one to add another.' : n ? `Room for ${MAX_BATCH_JOBS - n} more in this batch.` : `Up to ${MAX_BATCH_JOBS} per batch.`),
      btn(doc, 'Review batch', () => a.jobs.sheet(true), 'btn primary', { disabled: !n || s.busy, id: 'review' })),
    h(doc, 'div', { class: `cap${n >= MAX_BATCH_JOBS ? ' full' : ''}` }, ...Array.from({ length: MAX_BATCH_JOBS }, (_, i) => h(doc, 'i', { class: i < n ? 'on' : '' }))));
  return dock;
}

/** The batch review sheet: the jobs, the rules, the resume, Start. The only control that begins a batch. */
export function renderSheet(doc: Document, s: PanelState, a: Actions): Node[] {
  const picks = s.jobs.picked.map((key) => ({ key, meta: pickMeta(key, s) }));
  const n = picks.length;
  const list = h(doc, 'div', { class: 'minilist' });
  for (const p of picks)
    list.append(h(doc, 'div', { class: 'mini' }, avatar(doc, p.meta?.company ?? '?'), h(doc, 'span', { class: 't' }, h(doc, 'strong', { text: p.meta?.title ?? 'Job' }), h(doc, 'span', { text: [p.meta?.company, p.meta?.via && `via ${p.meta.via}`].filter(Boolean).join(' · ') })),
      h(doc, 'button', { class: 'ibtn', type: 'button', onclick: () => a.jobs.toggle(p.key), attrs: { 'aria-label': `Remove ${p.meta?.title ?? 'job'}` } }, icon(doc, 'close'))));
  const fact = (ico: Parameters<typeof icon>[1], strong: string, text: string) => h(doc, 'div', { class: 'fact' }, icon(doc, ico), h(doc, 'span', {}, h(doc, 'b', { text: strong }), ` ${text}`));
  const tabs = Math.min(s.settings?.tabs ?? 4, n || 1);
  const resume = h(doc, 'select', { id: 'resume-mode', attrs: { 'aria-label': 'Resume to upload' } }, h(doc, 'option', { text: 'My profile resume', attrs: { value: 'profile' } }), h(doc, 'option', { text: 'One built per job', attrs: { value: 'tailored' } }));
  resume.value = s.jobs.resumeMode;
  resume.addEventListener('change', () => a.jobs.resumeMode(resume.value as 'profile' | 'tailored'));
  const sheet = h(doc, 'div', { class: 'sheet', id: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' } },
    h(doc, 'div', { class: 'grab' }),
    h(doc, 'div', { class: 'sh' }, h(doc, 'h2', { id: 'sheet-title', text: 'Start this batch?' }), h(doc, 'p', { text: 'Plato applies to these jobs together, one batch, in your browser.' })),
    h(doc, 'div', { class: 'sb' },
      h(doc, 'div', { class: 'bigcount' }, h(doc, 'b', { class: 'num', text: String(n) }), h(doc, 'span', { text: `of ${MAX_BATCH_JOBS} jobs${n < MAX_BATCH_JOBS ? ` · room for ${MAX_BATCH_JOBS - n} more` : ' · full'}` })),
      list,
      n < MAX_BATCH_JOBS ? btn(doc, '+ Add more jobs', () => a.jobs.sheet(false), 'btn ghost sm') : null,
      h(doc, 'div', { class: 'facts' },
        fact('layers', 'One batch at a time.', `These ${n} run together, up to ${tabs} open tab${tabs === 1 ? '' : 's'} at once. Another batch can start once this one finishes.`),
        fact('sparkle', s.autoSubmitPreview ? 'Plato fills and submits.' : 'Plato fills the form.', s.autoSubmitPreview ? 'It presses Submit once per job and records the page’s own confirmation.' : 'It stops when the form is complete; you press Submit.'),
        fact('hand', 'You step in only when asked.', 'A sign-in, a human check, or a fact only you know.')),
      h(doc, 'label', { class: 'setrow' }, icon(doc, 'file'), h(doc, 'span', { class: 'l' }, 'Resume to upload', h(doc, 'small', { text: 'Uploaded first on every form.' })), resume)),
    h(doc, 'div', { class: 'sf' },
      btn(doc, `Start batch · ${n} job${n === 1 ? '' : 's'}`, a.jobs.start, 'btn primary block', { disabled: !n || s.busy, id: 'start-batch' }),
      btn(doc, 'Keep editing', () => a.jobs.sheet(false), 'btn block')));
  sheet.addEventListener('keydown', (e) => e.key === 'Escape' && a.jobs.sheet(false));
  return [h(doc, 'div', { class: 'scrim', onclick: () => a.jobs.sheet(false) }), sheet];
}
