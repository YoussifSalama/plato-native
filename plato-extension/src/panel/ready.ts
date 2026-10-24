import { icon } from './icons';
import { dropdown } from './dropdown';
import { h } from './view';

// The "Ready to apply" card: what will happen if the person presses Start, with the settings that
// change real behaviour (resume used, Plato pressing Submit, cover letters, how many at a time).
export interface RunSettings {
  autoSubmit: boolean;
  coverLetter: boolean;
  speed: 'careful' | 'smart' | 'fast';
  customMessage: string;
  tabs: number;
  resume: string | null;
  resumeMode: 'profile' | 'tailored'; // what goes into resume upload fields
}
export interface ReadyActions {
  start(): void;
  customize(): void;
  setting(patch: Partial<Pick<RunSettings, 'autoSubmit' | 'coverLetter' | 'speed'>>): void;
  openResume(): void;
}
const SPEEDS: [RunSettings['speed'], string][] = [['careful', 'Careful (2 at a time)'], ['smart', 'Smart (4 at a time)'], ['fast', 'Fast (8 at a time)']];

export function renderReady(doc: Document, n: number, matchRange: string | null, st: RunSettings | null, a: ReadyActions, busy: boolean, from?: string) {
  const card = h(doc, 'section', { class: 'ready', id: 'ready' });
  card.append(
    h(doc, 'div', { class: 'ready-head' }, h(doc, 'span', { class: 'ready-ico' }, icon(doc, 'target')),
      h(doc, 'div', {}, h(doc, 'h2', { text: `Ready to apply to your ${n} job${n === 1 ? '' : 's'}` }), from ? h(doc, 'p', { class: 'from', text: `From ${from}` }) : null,
        h(doc, 'p', { class: 'meta', text: `Your extension is connected and I've loaded ${n === 1 ? 'the job' : `all ${n} jobs`}. I'll apply to them based on your profile and preferences.` }))),
  );
  const row = (ico: Parameters<typeof icon>[1], label: string, value: Node | string, extra?: Node) =>
    h(doc, 'div', { class: 'srow' }, icon(doc, ico), h(doc, 'span', { class: 'slabel', text: label }), typeof value === 'string' ? h(doc, 'span', { class: 'sval', text: value }) : value, extra ?? null);
  const toggle = (on: boolean, key: 'autoSubmit' | 'coverLetter', label: string) => {
    const b = h(doc, 'button', { class: `tog${on ? ' on' : ''}`, text: on ? 'On' : 'Off', disabled: busy || !st, onclick: () => a.setting({ [key]: !on }) });
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', label);
    return b;
  };
  const speed = dropdown(doc, 'speed', SPEEDS.map(([v, t]) => [v, t] as [string, string]), st?.speed ?? 'smart', (v) => a.setting({ speed: v as RunSettings['speed'] }), { mini: true, disabled: busy || !st, label: 'Application speed' });
  const change = h(doc, 'button', { class: 'chip-link', text: 'Change', onclick: a.openResume });
  card.append(
    h(doc, 'div', { class: 'srows' },
      row('briefcase', 'Jobs to apply', h(doc, 'span', { class: 'sval big', text: String(n) })),
      row('sliders', 'Match range', matchRange ?? '…'),
      row('file', 'Resume', st?.resume ?? (st ? 'No resume yet' : '…'), change),
      row('letter', 'Include cover letter', toggle(!!st?.coverLetter, 'coverLetter', 'Include cover letter')),
      row('gauge', 'Application speed', speed)),
    h(doc, 'button', { class: 'primary block cta', id: 'start-all', disabled: busy || !n, onclick: a.start }, `Start applying to ${n === 1 ? 'this job' : `all ${n} jobs`}`, icon(doc, 'arrow', 'ico inline')),
    h(doc, 'button', { class: 'block soft', id: 'customize', text: 'Customize before applying', disabled: busy, onclick: a.customize }),
  );
  return card;
}
