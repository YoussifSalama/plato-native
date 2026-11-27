import type { Row, RowStatus } from '../core/batch-runner';
import type { ApiItem } from '../core/types';
import type { Registry } from '../providers/registry';
import type { AskQuestion } from '../v3/contract';
import { icon } from './icons';
import { avatar, banner, btn, h, type Actions, type BatchTab, type PanelState } from './view';
import { renderAskForm } from './ask-form';
import { renderReviewCard } from './review-card';
import { ALREADY_APPLIED, askFallback, type StopKind } from '../v3/run';

// The Batch view (owner design "Plato Apply: one screen per moment", 2026-11-27): how many are sent and the time
// saved, then three tabs: In line (the job being applied to now, what was just sent, what is next), Sent, and
// Needs you (the jobs left for last; when several ask the same questions, one answer sends them all). Every stop
// the engine can make keeps its own card (review before Submit, human checks, sign-ins, errors, the resume
// choice, verify, interrupted). Nothing here is a button that submits by itself: "Submit for me" and "Looks
// right, submit" are the seeker's explicit go-ahead for one job.
const LABEL: Record<RowStatus, string> = { queued: 'Queued', running: 'Running', needs: 'Needs you', verify: 'Please check', interrupted: 'Interrupted', elsewhere: 'Elsewhere', submitted: 'Submitted', failed: 'Failed', skipped: 'Skipped', cancelled: 'Cancelled', gone: 'Settled elsewhere' };
const STEP: Record<string, string> = { preparing: 'Opening the job page', review: 'Reading and filling the form', armed: 'Pressing Submit', 'needs-user': 'Waiting for you' };
// The four moments of one application, as the design shows them.
const MOMENTS = ['Opening the job page', 'Filling the form', 'Sending the application', 'Application sent'];
const NEEDS_TEXT: Record<string, string> = {
  login: 'Log in on the site yourself, then continue.',
  mfa: 'Complete the site’s verification yourself, then continue.',
  captcha: 'Complete the human check yourself, then continue.',
  questions: 'The form asks something Plato cannot answer.',
};
// ponytail: a flat 8 minutes per form filled by hand (the design's figure); a measured average when we have one.
const MINUTES_PER_FORM = 8;
const NEEDS: RowStatus[] = ['needs', 'verify', 'interrupted', 'elsewhere'];
const LINE: RowStatus[] = ['running', 'queued'];
export const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
};
const isHumanStep = (why: string) => /captcha|human check|sign in|log in|verification|solve it/i.test(why);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The tab on screen: the seeker's pick for this batch, else Needs you when something waits on them, else In line (Sent once finished). */
export function batchTab(s: PanelState): BatchTab {
  if (s.run && s.batchTab?.run === s.run.id) return s.batchTab.tab;
  if (s.rows.some((r) => NEEDS.includes(r.status))) return 'needs';
  return s.run?.status === 'finished' ? 'sent' : 'line';
}

export function renderBatch(doc: Document, s: PanelState, a: Actions, registry: Registry): Node[] {
  const run = s.run;
  if (!run)
    return [h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico' }, icon(doc, 'inbox')), h(doc, 'h3', { text: 'No batch yet' }), h(doc, 'p', { text: 'Pick up to 10 jobs and Plato applies to them for you, one form after another.' }), btn(doc, 'Choose jobs', () => a.view('jobs'), 'btn primary'))];
  const rows = s.rows;
  const out: Node[] = [];
  const interrupted = rows.filter((r) => r.status === 'interrupted');
  if (interrupted.length && run.status === 'running')
    out.push(banner(doc, 'warn', 'alert', 'Batch interrupted', `${interrupted.length} job${interrupted.length === 1 ? ' is' : 's are'} open on the server but not in this panel (a reload, or a closed tab). Resume picks them up in their tabs; Release gives them back. Nothing was submitted meanwhile.`,
      btn(doc, 'Resume', a.batch.resume, 'btn primary sm', { disabled: s.busy, id: 'resume-batch' }), btn(doc, 'Release', () => interrupted.forEach((r) => r.item && a.batch.release(r.item)), 'btn sm', { disabled: s.busy })));
  out.push(run.status === 'finished' ? summary(doc, s, a) : head(doc, s, a));

  const tab = batchTab(s);
  const line = rows.filter((r) => LINE.includes(r.status));
  const sentN = rows.filter((r) => r.status === 'submitted').length;
  const needs = rows.filter((r) => NEEDS.includes(r.status));
  const tabBtn = (k: BatchTab, text: string, n: number, warn = false) =>
    h(doc, 'button', { type: 'button', class: warn && n ? 'warn' : '', id: `btab-${k}`, onclick: () => a.batch.tab(k), attrs: { role: 'tab', 'aria-selected': String(tab === k), 'aria-controls': `bpanel-${k}` } }, text, h(doc, 'span', { class: 'n num', text: String(n) }));
  out.push(h(doc, 'nav', { class: 'btabs', attrs: { role: 'tablist', 'aria-label': 'Jobs in this batch' } }, tabBtn('line', 'In line', line.length), tabBtn('sent', 'Sent', sentN), tabBtn('needs', 'Needs you', needs.length, true)));
  // all three panels are drawn, the others hidden: a half-typed answer survives a switch of tab
  const panel = (k: BatchTab, ...children: Node[]) => {
    const el = h(doc, 'div', { class: 'bpanel', id: `bpanel-${k}`, attrs: { role: 'tabpanel', 'aria-labelledby': `btab-${k}` } }, ...children);
    if (tab !== k) el.hidden = true;
    return el;
  };
  out.push(panel('line', ...inLine(doc, s, a, registry, line, needs.length)), panel('sent', ...sent(doc, s, a, registry)), panel('needs', ...needsYou(doc, s, a, registry, needs)));
  return out;
}

const strip = (doc: Document, rows: Row[]) => h(doc, 'div', { class: 'strip' }, ...rows.map((r) => h(doc, 'i', { class: r.status, attrs: { title: `${r.meta.company}: ${LABEL[r.status]}` } })));

// The top card while the batch runs: the number sent and the time it saved, the strip, the estimate, Stop.
function head(doc: Document, s: PanelState, a: Actions) {
  const run = s.run!;
  const rows = s.rows;
  const n = (...st: RowStatus[]) => rows.filter((r) => st.includes(r.status)).length;
  const done = rows.filter((r) => !!r.outcome).length;
  const sentN = n('submitted');
  const needs = n(...NEEDS);
  const eta = s.eta;
  const etaLine = !s.policy ? [icon(doc, 'wifi'), h(doc, 'span', { text: 'Estimate paused while offline.' })]
    : eta === 'first' ? [icon(doc, 'clock'), h(doc, 'span', { text: 'Time estimate appears after the first job finishes.' })]
    : eta ? [icon(doc, 'clock'), h(doc, 'span', {}, 'About ', h(doc, 'b', { class: 'num', text: fmtDur(eta.ms) }), ` left · based on ${eta.basis} finished job${eta.basis === 1 ? '' : 's'}`)]
    : [icon(doc, 'hand'), h(doc, 'span', { text: needs ? 'Waiting on you for the rest.' : 'Finishing up.' })];
  const card = h(doc, 'section', { class: 'card bhead', id: 'batch-head' },
    h(doc, 'div', { class: 'top' }, h(doc, 'span', { class: 'eyebrow', text: `Batch running · ${run.label}` }), h(doc, 'span', { class: 'meta num', text: `started ${new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` })),
    h(doc, 'h2', { text: `Applying to ${plural(run.itemIds.length, 'job')}` }),
    h(doc, 'div', { class: 'sentbig' }, h(doc, 'b', { class: 'num', text: String(sentN) }), h(doc, 'span', {}, sentN === 1 ? 'application sent' : 'applications sent', h(doc, 'small', { class: 'num', text: sentN ? `About ${sentN * MINUTES_PER_FORM} minutes of form-filling saved` : `${done} of ${run.itemIds.length} finished` }))),
    strip(doc, rows),
    h(doc, 'p', { class: 'meta num fin', text: `${done} of ${run.itemIds.length} finished` }),
    h(doc, 'div', { class: 'eta' }, ...etaLine));
  if (s.stopArmed)
    card.append(banner(doc, 'warn', 'alert', 'Stop the batch?', 'Jobs already submitted stay submitted. Running jobs stop before Submit; a job already at Submit is left for you to settle.',
      btn(doc, 'Stop batch', () => a.batch.stop('yes'), 'btn danger sm', { disabled: s.busy, id: 'stop-yes' }), btn(doc, 'Keep going', () => a.batch.stop('no'), 'btn sm', { id: 'stop-no' })));
  else card.append(h(doc, 'div', { class: 'acts' }, btn(doc, 'Stop batch', () => a.batch.stop('ask'), 'btn', { icon: 'stop', disabled: s.busy, id: 'stop-batch' }), btn(doc, 'Browse jobs', () => a.view('jobs'), 'btn soft')));
  return card;
}

// The batch is over: how many went, what is still open for the seeker, and where the applications are.
function summary(doc: Document, s: PanelState, a: Actions) {
  const run = s.run!;
  const rows = s.rows;
  const n = (...st: RowStatus[]) => rows.filter((r) => st.includes(r.status)).length;
  const total = run.itemIds.length;
  const sentN = n('submitted');
  const failed = n('failed');
  const waiting = n('verify');
  const open = n(...NEEDS);
  const out = (cls: string, k: number, text: string) => h(doc, 'div', { class: `out ${cls}` }, h(doc, 'b', { class: 'num', text: String(k) }), h(doc, 'span', { text }));
  const sub = open
    ? `${plural(open, 'job is', 'jobs are')} still waiting for you. You can still send ${open === 1 ? 'it' : 'them'}.`
    : sentN === total ? 'All of them are in Applications on Plato.' : `The sent ones are in Applications on Plato.`;
  return h(doc, 'section', { class: 'card summary', id: 'batch-summary' },
    h(doc, 'span', { class: 'ring' }, icon(doc, 'check')),
    h(doc, 'p', { class: 'eyebrow', text: 'Batch finished' }),
    h(doc, 'h2', { class: 'num', text: waiting ? `Batch finished, ${waiting} to check` : sentN === total ? `All ${total} sent` : `${sentN} of ${total} sent` }),
    h(doc, 'p', { class: 'sub num', text: `${sentN} of ${total} application${total === 1 ? '' : 's'} sent · ${fmtDur((run.finishedAt ?? Date.now()) - run.startedAt)} · ${run.label}${sentN ? ` · about ${sentN * MINUTES_PER_FORM} min saved` : ''}` }),
    h(doc, 'p', { class: 'sub2', text: sub }),
    open ? h(doc, 'button', { type: 'button', class: 'openq', id: 'answer-open', onclick: () => a.batch.tab('needs') }, h(doc, 'span', { text: `Finish the last ${open === 1 ? 'one' : open}` }), h(doc, 'b', { text: 'Open' })) : null,
    strip(doc, rows),
    h(doc, 'div', { class: 'outs' }, out('ok', sentN, 'Submitted'), out(failed ? 'err' : '', failed, 'Failed'), out('', n('skipped', 'cancelled', 'gone'), 'Skipped')),
    h(doc, 'div', { class: 'acts' }, btn(doc, 'Start a new batch', a.batch.newBatch, 'btn primary', { icon: 'arrow', id: 'new-batch' }), failed ? btn(doc, `Retry ${failed} failed`, a.batch.retryFailed, 'btn', { id: 'retry-failed' }) : null),
    h(doc, 'a', { class: 'btn block soft', href: `${__WEB_ORIGIN__}/applications`, attrs: { target: '_blank', rel: 'noreferrer', id: 'see-applications' } }, 'See my applications on Plato', icon(doc, 'ext')));
}

// In line: the jobs being applied to now (one card each, with the four moments), the last one sent, what is next.
function inLine(doc: Document, s: PanelState, a: Actions, registry: Registry, line: Row[], needsN: number): Node[] {
  const out: Node[] = [];
  const running = line.filter((r) => r.status === 'running');
  const queued = line.filter((r) => r.status === 'queued');
  for (const r of running) out.push(nowCard(doc, r, s, a));
  const last = s.rows.filter((r) => r.status === 'submitted' && r.outcome).sort((x, y) => y.outcome!.at - x.outcome!.at)[0];
  if (last) out.push(h(doc, 'p', { class: 'justsent' }, h(doc, 'span', { class: 'ok' }, icon(doc, 'check')), h(doc, 'span', {}, 'Just sent: ', h(doc, 'b', { text: last.meta.title }), ` · ${last.meta.company}`)));
  if (queued.length) {
    out.push(h(doc, 'div', { class: 'sect' }, 'Up next', h(doc, 'span', { class: 'n num', text: `· ${queued.length}` })));
    out.push(h(doc, 'div', { class: 'minilist upnext' }, ...queued.map((r, i) => upNext(doc, r, s, a, registry, i === 0))));
  }
  if (!running.length && !queued.length)
    out.push(needsN
      ? h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico warn' }, icon(doc, 'hand')), h(doc, 'h3', { text: 'Everything else is done' }), h(doc, 'p', { text: `${plural(needsN, 'job is', 'jobs are')} waiting for you.` }), btn(doc, 'Answer now', () => a.batch.tab('needs'), 'btn primary', { id: 'line-answer' }))
      : h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico' }, icon(doc, 'check')), h(doc, 'h3', { text: 'Nothing in line' }), h(doc, 'p', { text: s.run?.status === 'finished' ? 'Every job in this batch has finished.' : 'The last jobs are finishing.' })));
  return out;
}

function nowCard(doc: Document, r: Row, s: PanelState, a: Actions) {
  const item = r.item;
  const sess = s.sessions[r.itemId];
  const at = item?.state === 'AWAITING_SUBMIT' || sess?.step === 'armed' ? 2 : sess?.step === 'review' ? 1 : 0;
  const el = h(doc, 'section', { class: 'card now', attrs: { 'data-item': r.itemId } },
    h(doc, 'div', { class: 'top' }, h(doc, 'span', { class: 'eyebrow live' }, h(doc, 'i'), 'Applying now'), h(doc, 'span', { class: `pill ${r.status}` }, h(doc, 'i'), LABEL[r.status])),
    h(doc, 'div', { class: 'who' }, avatar(doc, item?.job?.company ?? r.meta.company), h(doc, 'span', { class: 't' }, h(doc, 'strong', { text: item?.job?.title ?? r.meta.title }), h(doc, 'span', { text: item?.job?.company ?? r.meta.company }))),
    h(doc, 'ol', { class: 'moments' }, ...MOMENTS.map((m, i) => h(doc, 'li', { class: i < at ? 'done' : i === at ? 'on' : '' }, h(doc, 'i', {}, i < at ? icon(doc, 'check') : null), h(doc, 'span', { text: m })))),
    h(doc, 'p', { class: 'step', text: s.progress[r.itemId] ?? STEP[sess?.step ?? ''] ?? 'Working' }));
  if (item) {
    const acts = h(doc, 'div', { class: 'rowacts' }, btn(doc, 'Watch', () => a.batch.watch(item), 'btn ghost sm', { icon: 'ext', disabled: s.busy }));
    if (item.state !== 'AWAITING_SUBMIT') acts.append(btn(doc, 'Cancel this job', () => a.batch.cancelJob(item), 'btn ghost sm', { disabled: s.busy }));
    el.append(acts);
  }
  return el;
}

function blockedWhy(item: ApiItem | undefined, s: PanelState, registry: Registry) {
  if (!item) return null;
  if (!item.provider || registry.policyOf(item.provider, s.policy) !== 'FILL_ONLY') return 'Not available: this site is not enabled for Plato yet.';
  if (!registry.get(item.provider)?.adapter) return 'Not available yet: nothing is built for this site.';
  return null;
}

function upNext(doc: Document, r: Row, s: PanelState, a: Actions, registry: Registry, first: boolean) {
  const item = r.item;
  const why = blockedWhy(item, s, registry);
  const tabs = Math.min(s.settings?.tabs ?? 4, 10);
  return h(doc, 'div', { class: 'mini', attrs: { 'data-item': r.itemId } },
    avatar(doc, r.meta.company, 'av'),
    h(doc, 'span', { class: 't' }, h(doc, 'strong', { text: item?.job?.title ?? r.meta.title }), h(doc, 'span', { text: why ?? (first ? `${r.meta.company} · next, when a tab is free (${tabs} at once)` : r.meta.company) })),
    h(doc, 'span', { class: `pill queued${first ? ' next' : ''}` }, h(doc, 'i'), LABEL.queued),
    item ? h(doc, 'button', { type: 'button', class: 'ibtn', onclick: () => a.batch.cancelJob(item), disabled: s.busy, attrs: { 'aria-label': `Remove ${r.meta.title} from the batch`, title: 'Remove from batch' } }, icon(doc, 'close')) : h(doc, 'span'));
}

// Sent: what went, then what did not, each with what happened.
function sent(doc: Document, s: PanelState, a: Actions, registry: Registry): Node[] {
  const done = s.rows.filter((r) => !!r.outcome);
  const ok = done.filter((r) => r.status === 'submitted').sort((x, y) => y.outcome!.at - x.outcome!.at);
  const not = done.filter((r) => r.status !== 'submitted');
  const out: Node[] = [];
  if (ok.length) out.push(h(doc, 'div', { class: 'sect' }, 'Sent', h(doc, 'span', { class: 'n num', text: `· ${ok.length}` })), ...ok.map((r) => row(doc, r, s, a, registry)));
  if (not.length) out.push(h(doc, 'div', { class: 'sect' }, 'Not sent', h(doc, 'span', { class: 'n num', text: `· ${not.length}` })), ...not.map((r) => row(doc, r, s, a, registry)));
  if (!out.length) out.push(h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico' }, icon(doc, 'inbox')), h(doc, 'h3', { text: 'Nothing sent yet' }), h(doc, 'p', { text: 'Each application shows up here the moment it goes.' })));
  return out;
}

// The questions behind a stop, when the stop is only questions: the jobs asking the same ones share one answer.
const askOf = (r: Row, s: PanelState): AskQuestion[] | null => {
  const sess = s.sessions[r.itemId];
  if (r.status !== 'needs' || !r.item || !sess?.ask?.length || sess.message === 'resume' || r.item.state === 'AWAITING_SUBMIT') return null;
  return (sess.stop ?? 'ask') === 'ask' ? sess.ask : null;
};
/** A question's words, normalised: the same question on two forms matches. */
export const askLabel = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const askKey = (qs: AskQuestion[]) => qs.map((q) => askLabel(q.label)).sort().join(' | ');

// Needs you: the jobs left for last. Same questions on several forms: one card, one answer, all of them go.
function needsYou(doc: Document, s: PanelState, a: Actions, registry: Registry, needs: Row[]): Node[] {
  if (!needs.length) return [h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico' }, icon(doc, 'check')), h(doc, 'h3', { text: 'Nothing needs you right now' }), h(doc, 'p', { text: 'When a form asks something Plato can’t answer, the job waits here and the others carry on.' }))];
  const groups = new Map<string, Row[]>();
  for (const r of needs) {
    const qs = askOf(r, s);
    if (qs) groups.set(askKey(qs), [...(groups.get(askKey(qs)) ?? []), r]);
  }
  const shared = [...groups.entries()].filter(([, rs]) => rs.length > 1);
  const inShared = new Set(shared.flatMap(([, rs]) => rs.map((r) => r.itemId)));
  const order: Record<RowStatus, number> = { needs: 0, verify: 0, interrupted: 1, elsewhere: 1, running: 2, queued: 3, submitted: 4, failed: 5, skipped: 6, cancelled: 7, gone: 8 };
  const rest = needs.filter((r) => !inShared.has(r.itemId)).sort((x, y) => order[x.status] - order[y.status]);
  return [
    h(doc, 'p', { class: 'lead', text: 'Left for last: the other jobs went first. Answer here and these go too.' }),
    ...shared.map(([key, rs]) => sharedCard(doc, key, rs, s, a)),
    ...rest.map((r) => row(doc, r, s, a, registry)),
  ];
}

function sharedCard(doc: Document, key: string, rows: Row[], s: PanelState, a: Actions) {
  const items = rows.map((r) => r.item!);
  const questions = askOf(rows[0]!, s)!;
  const el = h(doc, 'section', { class: 'jrow needs shared', attrs: { 'data-group': key } },
    h(doc, 'p', { class: 'grp', text: `${plural(rows.length, 'form')} ask the same question${questions.length > 1 ? 's' : ''}` }),
    h(doc, 'div', { class: 'minilist' }, ...rows.map((r) => h(doc, 'div', { class: 'mini', attrs: { 'data-item': r.itemId } }, avatar(doc, r.meta.company, 'av'), h(doc, 'span', { class: 't' }, h(doc, 'strong', { text: r.item?.job?.title ?? r.meta.title }), h(doc, 'span', { text: r.meta.company })), h(doc, 'span', { class: 'pill needs' }, h(doc, 'i'), 'Waiting')))),
    h(doc, 'div', { class: 'qcard ask' }, h(doc, 'p', { class: 'qt', text: `One answer for all ${rows.length}` }), h(doc, 'p', { class: 'q', text: 'Your answer goes into each of these forms and is kept for the next ones.' }),
      renderAskForm(doc, `group-${rows.map((r) => r.itemId).join('-')}`, questions, { busy: s.busy, submitLabel: `Save and send ${rows.length === 2 ? 'both' : `all ${rows.length}`}`, onSubmit: (text, answers) => a.batch.answerMany(items, text, answers) })),
    h(doc, 'div', { class: 'rowacts' }, btn(doc, `Skip these ${rows.length} jobs`, () => a.batch.skipMany(items), 'btn ghost sm', { disabled: s.busy, id: `skip-group-${rows[0]!.itemId}` })));
  return el;
}

function row(doc: Document, r: Row, s: PanelState, a: Actions, registry: Registry) {
  const item = r.item;
  const sess = s.sessions[r.itemId];
  const title = item?.job?.title ?? r.meta.title;
  const company = item?.job?.company ?? r.meta.company;
  const via = r.meta.provider ? (registry.get(r.meta.provider)?.label ?? r.meta.provider) : '';
  const el = h(doc, 'section', { class: `jrow${['needs', 'verify'].includes(r.status) ? ' needs' : ['interrupted', 'elsewhere'].includes(r.status) ? ' int' : ''}`, attrs: { 'data-item': r.itemId } });
  el.append(h(doc, 'div', { class: 'top' }, avatar(doc, company), h(doc, 'span', { class: 't' }, h(doc, 'strong', { text: title }), h(doc, 'span', { text: [company, via && `via ${via}`].filter(Boolean).join(' · ') })),
    h(doc, 'span', { class: `pill ${r.status}` }, h(doc, 'i'), LABEL[r.status])));
  const note = (text: string, cls = '') => el.append(h(doc, 'p', { class: `note ${cls}`.trim(), text }));
  const acts = h(doc, 'div', { class: 'rowacts' });
  const act = (text: string, fn: () => void, cls = 'btn sm', ico?: Parameters<typeof icon>[1]) => acts.append(btn(doc, text, fn, cls, { disabled: s.busy, icon: ico }));

  switch (r.status) {
    case 'queued':
      note(blockedWhy(item, s, registry) ?? `Waits for a free slot (${Math.min(s.settings?.tabs ?? 4, 10)} tab${(s.settings?.tabs ?? 4) === 1 ? '' : 's'} at once).`);
      if (item) act('Remove from batch', () => a.batch.cancelJob(item), 'btn ghost sm');
      break;
    case 'running':
      el.append(h(doc, 'p', { class: 'step', text: s.progress[r.itemId] ?? STEP[sess?.step ?? ''] ?? 'Working' }));
      if (item) {
        act('Watch', () => a.batch.watch(item), 'btn ghost sm', 'ext');
        if (item.state !== 'AWAITING_SUBMIT') act('Cancel this job', () => a.batch.cancelJob(item), 'btn ghost sm');
      }
      break;
    case 'needs': {
      if (!item) break;
      if (sess?.message === 'resume') {
        note('This application asks for a resume. Which one should Plato upload?');
        act('Use my profile resume', () => a.batch.resumeChoice(item, 'profile'), 'btn primary sm');
        act('Make one for this job', () => a.batch.resumeChoice(item, 'tailored'));
      } else if (item.state === 'AWAITING_SUBMIT' && sess?.step === 'armed' && s.reviews?.[item.id]) {
        // stopped before Submit with the list of what was filled: the seeker fixes or approves
        el.append(renderReviewCard(doc, item.id, s.reviews[item.id]!, { busy: s.busy, onFix: (changes) => a.batch.fixReview(item, changes), onSubmit: () => a.batch.submitNow(item), onOpen: () => a.batch.watch(item) }));
        act('Check the page', () => a.batch.checkPage(item), 'btn ghost sm');
        act('I submitted it', () => a.batch.attest(item), 'btn ghost sm');
        act('I am not sure', () => a.batch.notSure(item), 'btn ghost sm');
      } else if (item.state === 'AWAITING_SUBMIT') {
        note(sess?.message === 'submit_failed' ? 'Plato tried to submit and could not. Press Submit on the job page yourself, then come back here.' : 'The form is complete. Press Submit on the job page yourself, then come back here.', 'warn');
        if (sess) act('Submit for me', () => a.batch.submitNow(item), 'btn primary sm');
        act('Open the tab', () => a.batch.watch(item), undefined, 'ext');
        act('Check the page', () => a.batch.checkPage(item));
        act('I submitted it', () => a.batch.attest(item), sess ? 'btn sm' : 'btn primary sm');
        act('I am not sure', () => a.batch.notSure(item));
      } else {
        const why = sess?.detail ?? NEEDS_TEXT[sess?.message ?? ''] ?? 'Plato stopped here and needs you on the page.';
        // the kind of stop decides the card: an older engine or backend gives only words, so the words are classified
        const stop: StopKind = sess?.stop ?? (sess?.ask ? 'ask' : isHumanStep(why) ? 'captcha' : /lost the page|could not be reached|internal server error|network error/i.test(why) ? 'error' : ALREADY_APPLIED.test(why) ? 'duplicate' : /refused|did not accept/i.test(why) ? 'refused' : 'ask');
        // the error code: the seeker copies it and sends it to us; GET /admin/errors?code= finds this stop
        const code = (c: string) => {
          const copy = btn(doc, 'Copy', () => void navigator.clipboard.writeText(c).then(() => (copy.textContent = 'Copied')).catch(() => undefined), 'btn ghost sm');
          return h(doc, 'p', { class: 'ecode' }, 'Error code ', h(doc, 'code', { text: c }), copy);
        };
        const card = (title: string, text: string, hint: string | null, ...acts: Node[]) => el.append(h(doc, 'div', { class: `qcard ${stop}` }, h(doc, 'p', { class: 'qt', text: title }), h(doc, 'p', { class: 'q', text }, hint ? h(doc, 'small', { text: hint }) : null), sess?.code ? code(sess.code) : null, acts.length ? h(doc, 'div', { class: 'chips' }, ...acts) : null));
        const open = () => btn(doc, 'Open the tab', () => a.batch.watch(item), 'btn sm', { icon: 'ext', disabled: s.busy });
        const again = (text = 'Try again') => btn(doc, text, () => a.batch.retry(item), 'btn primary sm', { disabled: s.busy, id: `continue-${item.id}` });
        switch (stop) {
          case 'ask': {
            // the questions, as a form: pills, lists and boxes by type; a stepper when there are several
            const questions = sess?.ask ?? askFallback(why);
            el.append(h(doc, 'div', { class: 'qcard ask' }, h(doc, 'p', { class: 'qt', text: questions.length > 1 ? `Plato needs ${questions.length} answers from you` : 'Plato needs one answer from you' }),
              sess?.ask ? h(doc, 'p', { class: 'q', text: why }, h(doc, 'small', { text: 'Plato will not guess these. Your answers go into this application and are kept for the next ones.' })) : null,
              renderAskForm(doc, item.id, questions, { busy: s.busy, onSubmit: (text, answers) => a.batch.answerJob(item, text, answers) })));
            act('Ask Plato', () => a.batch.ticket(item), 'btn ghost sm', 'chat');
            act('Open the tab', () => a.batch.watch(item), 'btn ghost sm', 'ext');
            act('Skip this job', () => a.batch.skipMany([item]), 'btn ghost sm');
            break;
          }
          case 'captcha':
            card('A human check stopped Plato', why, null, open(), again('I solved it, continue'));
            break;
          case 'refused':
            card('The site did not accept the submission', why, 'Plato will not send it again by itself. Look at the page; if it is fine to send, press Submit there yourself.', open(), btn(doc, 'I submitted it', () => a.batch.attest(item), 'btn primary sm', { disabled: s.busy }), btn(doc, 'Try again', () => a.batch.retry(item), 'btn sm', { disabled: s.busy }));
            break;
          case 'duplicate':
            card('This site says you already applied', why, 'Plato has no record of sending it. Did you apply to this job yourself before?', btn(doc, 'Yes, mark it applied', () => a.batch.attest(item), 'btn primary sm', { disabled: s.busy }), btn(doc, 'No, look again', () => a.batch.retry(item), 'btn sm', { disabled: s.busy }), open());
            break;
          case 'error':
            card('Plato hit a problem on its own side', why, 'The job site is not involved; nothing was typed or sent since the last step.', again(), open());
            break;
          case 'site': // an account, a sign-in, an email code or a page Plato cannot place: the seeker acts on the site, then Continue
            card('Plato needs you on the job site', why, 'Plato filled nothing on this page. Continue picks up from the page as it is.', open(), again('Continue'));
            break;
          case 'loop':
            card('Plato was going in circles', why, null, open(), again('Continue'));
            break;
          case 'lost':
            card('Plato lost the job’s tab', why, 'Nothing was sent. Reopen the tab, then continue.', open(), again());
            break;
          default:
            card('Plato stopped and needs a decision', why, 'Try again continues from the page as it is now.', again(), open(), btn(doc, 'Ask Plato', () => a.batch.ticket(item), 'btn ghost sm', { icon: 'chat', disabled: s.busy }));
        }
      }
      break;
    }
    case 'verify':
      if (!item) break;
      note(`Plato cannot tell whether this was sent${item.verify_reason ? ` (${item.verify_reason.replace(/_/g, ' ')})` : ''}. Check the site or your email. Plato will not send it again by itself.`, 'warn');
      act('It was sent', () => a.batch.attest(item), 'btn primary sm');
      act('It was not', () => a.batch.notSubmitted(item));
      act('Check the page', () => a.batch.checkPage(item));
      break;
    case 'interrupted':
      if (!item) break;
      note('Open on the server but not in this panel. It has not been submitted.');
      act('Resume', a.batch.resume, 'btn primary sm');
      act('Release this job', () => a.batch.release(item));
      break;
    case 'elsewhere':
      note('Another linked browser is working on this job.');
      break;
    default:
      if (r.outcome) {
        const p = h(doc, 'p', { class: `note${r.status === 'submitted' ? ' ok' : r.status === 'failed' ? ' err' : ''}`, text: r.outcome.note });
        if (r.outcome.ms) p.append(' ', h(doc, 'span', { class: 'meta num', text: `· ${fmtDur(r.outcome.ms)}` }));
        el.append(p);
      }
  }
  if (acts.childElementCount) el.append(acts);
  return el;
}
export type { ApiItem };
