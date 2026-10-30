import type { Row, RowStatus } from '../core/batch-runner';
import type { ApiItem } from '../core/types';
import type { Registry } from '../providers/registry';
import { icon } from './icons';
import { avatar, banner, btn, h, type Actions, type PanelState } from './view';
import { renderAskForm } from './ask-form';
import { askFallback, type StopKind } from '../v3/run';

// The Batch view: one batch, its progress, each job's outcome, and what the person has to do. Nothing here is a
// button that submits by itself: "Submit for me" is the seeker's explicit go-ahead for one armed job.
const LABEL: Record<RowStatus, string> = { queued: 'Queued', running: 'Running', needs: 'Needs you', verify: 'Please check', interrupted: 'Interrupted', elsewhere: 'Elsewhere', submitted: 'Submitted', failed: 'Failed', skipped: 'Skipped', cancelled: 'Cancelled', gone: 'Settled elsewhere' };
const STEP: Record<string, string> = { preparing: 'Opening the job page', review: 'Reading and filling the form', armed: 'Pressing Submit', 'needs-user': 'Waiting for you' };
const NEEDS_TEXT: Record<string, string> = {
  login: 'Log in on the site yourself, then continue.',
  mfa: 'Complete the site’s verification yourself, then continue.',
  captcha: 'Complete the human check yourself, then continue.',
  questions: 'The form asks something Plato cannot answer.',
};
export const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
};
const isHumanStep = (why: string) => /captcha|human check|sign in|log in|verification|solve it/i.test(why);

export function renderBatch(doc: Document, s: PanelState, a: Actions, registry: Registry): Node[] {
  const run = s.run;
  if (!run)
    return [h(doc, 'div', { class: 'empty card' }, h(doc, 'span', { class: 'eico' }, icon(doc, 'inbox')), h(doc, 'h3', { text: 'No batch yet' }), h(doc, 'p', { text: 'Pick up to 10 jobs and Plato applies to them together.' }), btn(doc, 'Choose jobs', () => a.view('jobs'), 'btn primary'))];
  const rows = s.rows;
  const count = (...st: RowStatus[]) => rows.filter((r) => st.includes(r.status)).length;
  const out: Node[] = [];
  const interrupted = rows.filter((r) => r.status === 'interrupted');
  if (interrupted.length && run.status === 'running')
    out.push(banner(doc, 'warn', 'alert', 'Batch interrupted', `${interrupted.length} job${interrupted.length === 1 ? ' is' : 's are'} open on the server but not in this panel (a reload, or a closed tab). Resume picks them up in their tabs; Release gives them back. Nothing was submitted meanwhile.`,
      btn(doc, 'Resume', a.batch.resume, 'btn primary sm', { disabled: s.busy, id: 'resume-batch' }), btn(doc, 'Release', () => interrupted.forEach((r) => r.item && a.batch.release(r.item)), 'btn sm', { disabled: s.busy })));
  out.push(run.status === 'finished' ? summary(doc, s, a) : head(doc, s, a));
  const order: Record<RowStatus, number> = { needs: 0, verify: 0, interrupted: 1, elsewhere: 1, running: 2, queued: 3, submitted: 4, failed: 5, skipped: 6, cancelled: 7, gone: 8 };
  const groups: { title: string; items: Row[] }[] = [
    { title: 'Needs you', items: rows.filter((r) => ['needs', 'verify', 'interrupted', 'elsewhere'].includes(r.status)) },
    { title: 'In progress', items: rows.filter((r) => r.status === 'running' || r.status === 'queued') },
    { title: run.status === 'finished' ? 'Outcomes' : 'Finished', items: rows.filter((r) => !!r.outcome) },
  ];
  for (const g of groups) {
    if (!g.items.length) continue;
    out.push(h(doc, 'div', { class: 'sect' }, g.title, h(doc, 'span', { class: 'n num', text: `· ${g.items.length}` })));
    for (const r of [...g.items].sort((x, y) => order[x.status] - order[y.status])) out.push(row(doc, r, s, a, registry));
  }
  void count;
  return out;
}

const strip = (doc: Document, rows: Row[]) => h(doc, 'div', { class: 'strip' }, ...rows.map((r) => h(doc, 'i', { class: r.status, attrs: { title: `${r.meta.company}: ${LABEL[r.status]}` } })));

function head(doc: Document, s: PanelState, a: Actions) {
  const run = s.run!;
  const rows = s.rows;
  const n = (...st: RowStatus[]) => rows.filter((r) => st.includes(r.status)).length;
  const done = rows.filter((r) => !!r.outcome).length;
  const needs = n('needs', 'verify', 'interrupted', 'elsewhere');
  const counts = h(doc, 'div', { class: 'counts' });
  const c = (cls: string, k: number, text: string) => k && counts.append(h(doc, 'span', { class: `${cls} num` }, h(doc, 'i'), `${k} ${text}`));
  c('submitted', n('submitted'), 'submitted');
  c('running', n('running'), 'running');
  c('needs', needs, needs === 1 ? 'needs you' : 'need you');
  c('', n('queued'), 'queued');
  c('failed', n('failed'), 'failed');
  c('', n('skipped', 'cancelled', 'gone'), 'skipped');
  const eta = s.eta;
  const etaLine = !s.policy ? [icon(doc, 'wifi'), h(doc, 'span', { text: 'Estimate paused while offline.' })]
    : eta === 'first' ? [icon(doc, 'clock'), h(doc, 'span', { text: 'Time estimate appears after the first job finishes.' })]
    : eta ? [icon(doc, 'clock'), h(doc, 'span', {}, 'About ', h(doc, 'b', { class: 'num', text: fmtDur(eta.ms) }), ` left · based on ${eta.basis} finished job${eta.basis === 1 ? '' : 's'}`)]
    : [icon(doc, 'hand'), h(doc, 'span', { text: needs ? 'Waiting on you for the rest.' : 'Finishing up.' })];
  const card = h(doc, 'section', { class: 'card bhead', id: 'batch-head' },
    h(doc, 'div', { class: 'top' }, h(doc, 'span', { class: 'eyebrow', text: `Batch running · ${run.label}` }), h(doc, 'span', { class: 'meta num', text: `started ${new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` })),
    h(doc, 'h2', {}, h(doc, 'span', { class: 'num', text: String(done) }), ' of ', h(doc, 'span', { class: 'num', text: String(run.itemIds.length) }), ' finished'),
    strip(doc, rows), counts, h(doc, 'div', { class: 'eta' }, ...etaLine));
  if (s.stopArmed)
    card.append(banner(doc, 'warn', 'alert', 'Stop the batch?', 'Jobs already submitted stay submitted. Running jobs stop before Submit; a job already at Submit is left for you to settle.',
      btn(doc, 'Stop batch', () => a.batch.stop('yes'), 'btn danger sm', { disabled: s.busy, id: 'stop-yes' }), btn(doc, 'Keep going', () => a.batch.stop('no'), 'btn sm', { id: 'stop-no' })));
  else card.append(h(doc, 'div', { class: 'acts' }, btn(doc, 'Stop batch', () => a.batch.stop('ask'), 'btn', { icon: 'stop', disabled: s.busy, id: 'stop-batch' }), btn(doc, 'Browse jobs', () => a.view('jobs'), 'btn soft')));
  return card;
}

function summary(doc: Document, s: PanelState, a: Actions) {
  const run = s.run!;
  const rows = s.rows;
  const n = (...st: RowStatus[]) => rows.filter((r) => st.includes(r.status)).length;
  const sent = n('submitted');
  const failed = n('failed');
  const waiting = n('verify');
  const out = (cls: string, k: number, text: string) => h(doc, 'div', { class: `out ${cls}` }, h(doc, 'b', { class: 'num', text: String(k) }), h(doc, 'span', { text }));
  return h(doc, 'section', { class: 'card summary', id: 'batch-summary' },
    h(doc, 'span', { class: 'ring' }, icon(doc, 'check')),
    h(doc, 'h2', { text: waiting ? `Batch finished, ${waiting} to check` : 'Batch finished' }),
    h(doc, 'p', { class: 'sub num', text: `${sent} of ${run.itemIds.length} application${run.itemIds.length === 1 ? '' : 's'} sent · ${fmtDur((run.finishedAt ?? Date.now()) - run.startedAt)} · ${run.label}` }),
    strip(doc, rows),
    h(doc, 'div', { class: 'outs' }, out('ok', sent, 'Submitted'), out(failed ? 'err' : '', failed, 'Failed'), out('', n('skipped', 'cancelled', 'gone'), 'Skipped')),
    h(doc, 'div', { class: 'acts' }, btn(doc, 'Start a new batch', a.batch.newBatch, 'btn primary', { icon: 'arrow', id: 'new-batch' }), failed ? btn(doc, `Retry ${failed} failed`, a.batch.retryFailed, 'btn', { id: 'retry-failed' }) : null));
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
  const disabledWhy = item && (!item.provider || registry.policyOf(item.provider, s.policy) !== 'FILL_ONLY') ? 'Not available: this site is not enabled for Plato yet.' : item && !registry.get(item.provider!)?.adapter ? 'Not available yet: nothing is built for this site.' : null;

  switch (r.status) {
    case 'queued':
      note(disabledWhy ?? `Waits for a free slot (${Math.min(s.settings?.tabs ?? 4, 10)} tab${(s.settings?.tabs ?? 4) === 1 ? '' : 's'} at once).`);
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
        const stop: StopKind = sess?.stop ?? (sess?.ask ? 'ask' : isHumanStep(why) ? 'captcha' : /lost the page|could not be reached|internal server error|network error/i.test(why) ? 'error' : /refused|did not accept/i.test(why) ? 'refused' : 'ask');
        const card = (title: string, text: string, hint: string | null, ...acts: Node[]) => el.append(h(doc, 'div', { class: `qcard ${stop}` }, h(doc, 'p', { class: 'qt', text: title }), h(doc, 'p', { class: 'q', text }, hint ? h(doc, 'small', { text: hint }) : null), acts.length ? h(doc, 'div', { class: 'chips' }, ...acts) : null));
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
            break;
          }
          case 'captcha':
            card('A human check stopped Plato', why, null, open(), again('I solved it, continue'));
            break;
          case 'refused':
            card('The site did not accept the submission', why, 'Plato will not send it again by itself. Look at the page; if it is fine to send, press Submit there yourself.', open(), btn(doc, 'I submitted it', () => a.batch.attest(item), 'btn primary sm', { disabled: s.busy }), btn(doc, 'Try again', () => a.batch.retry(item), 'btn sm', { disabled: s.busy }));
            break;
          case 'error':
            card('Plato hit a problem on its own side', why, 'The job site is not involved; nothing was typed or sent since the last step.', again(), open());
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
