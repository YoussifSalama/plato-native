import { icon } from './icons';
import { h } from './view';

// The orchestrator chat, pinned at the bottom of the panel: messages above, the one open
// question as tappable chips, and a composer. Text only (textContent), like the rest.
export interface Assistant {
  messages: { role: 'user' | 'assistant'; content: string }[];
  ask?: { jobId: string | null; question: string; choices: string[] };
  thinking: boolean;
  draft?: string; // what is typed but not sent: survives the panel's periodic redraws
}

const SUGGEST: Record<'ready' | 'running' | 'idle', string[]> = {
  idle: ['Which jobs match me best?', 'Only remote jobs', 'Skip specific companies'],
  ready: ['Only apply to jobs with 90%+ match', 'Skip specific companies', 'Add a custom message to each application'],
  running: ['How is it going?', 'What needs me?', 'Pause applying'],
};
const GREET = {
  ready: "I'm ready to start applying! You can also tell me if you want to make any changes, for example:",
  running: "I'm applying now. Ask me anything about it, for example:",
  idle: 'Nothing is being applied to right now. Pick jobs above, or ask me, for example:',
};
const HINTS = ['Start applying', 'Only remote jobs', 'Skip Google'];

export function renderChat(doc: Document, a: Assistant, send: (text: string) => void, mode: 'ready' | 'running' | 'idle' = 'running') {
  const dock = h(doc, 'section', { class: 'chat', id: 'assistant' });
  const msgs = h(doc, 'div', { class: 'msgs', id: 'msgs' });
  if (!a.messages.length && !a.ask) {
    // first contact: Plato introduces what it can do, with tappable examples
    msgs.append(h(doc, 'div', { class: 'greet' }, h(doc, 'span', { class: 'mark sm', text: 'P' }),
      h(doc, 'p', { class: 'msg assistant', text: GREET[mode] })));
    const sug = h(doc, 'div', { class: 'suggest' });
    for (const t of SUGGEST[mode]) sug.append(h(doc, 'button', { class: 'chip outline', text: t, disabled: a.thinking, onclick: () => send(t) }));
    msgs.append(sug);
  }
  for (const m of a.messages.slice(-30)) msgs.append(h(doc, 'p', { class: `msg ${m.role}`, text: m.content }));
  if (a.ask?.question) msgs.append(h(doc, 'p', { class: 'msg assistant ask', text: a.ask.question }));
  if (a.thinking) msgs.append(h(doc, 'p', { class: 'msg assistant typing', text: '…' }));
  dock.append(msgs);
  if (a.ask?.choices.length) {
    const chips = h(doc, 'div', { class: 'chips' });
    for (const c of a.ask.choices) chips.append(h(doc, 'button', { class: 'chip', text: c, disabled: a.thinking, onclick: () => send(c) }));
    dock.append(chips);
  }
  const input = h(doc, 'input', { id: 'answer', type: 'text', placeholder: a.ask ? 'Type your answer…' : 'Type a message…', maxlength: 500, autocomplete: 'off' });
  input.value = a.draft ?? '';
  input.addEventListener('input', () => (a.draft = input.value));
  const go = () => {
    const v = input.value.trim();
    if (!v) return;
    a.draft = '';
    send(v);
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  const sendBtn = h(doc, 'button', { class: 'send', text: '↑', disabled: a.thinking, onclick: go });
  sendBtn.setAttribute('aria-label', 'Send');
  dock.append(h(doc, 'div', { class: 'composer' }, icon(doc, 'sparkle', 'ico spark'), input, sendBtn));
  const hints = h(doc, 'p', { class: 'hints' }, 'Try: ');
  HINTS.forEach((t, i) => hints.append(h(doc, 'button', { class: 'hint-link', text: `"${t}"`, onclick: () => send(t) }), i < HINTS.length - 1 ? ' | ' : ''));
  dock.append(hints);
  return dock;
}
