// Visible "Plato is working here" layer, like an assistant cursor: a soft glow around the
// tab, a labelled pill with a Stop button, and a cursor that glides to each field Plato
// filled. Pure UX so the person can see what is happening. It never blocks the page
// (only the pill takes clicks), changes no timing of the real fill, and reads nothing.
// Styles use a constructable stylesheet so a page's CSP cannot strip them.
const CSS = `
:host { all: initial; }
.frame { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; box-shadow: inset 0 0 0 3px rgba(79,63,247,.55), inset 0 0 38px rgba(79,63,247,.28); animation: pulse 2.4s ease-in-out infinite; opacity: 0; transition: opacity .25s; }
.on .frame { opacity: 1; }
.pill { position: fixed; top: 12px; left: 50%; transform: translate(-50%,-80px); display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 14px; font: 600 13px/1 system-ui, sans-serif; white-space: nowrap; color: #fff; background: #4f3ff7; border-radius: 999px; box-shadow: 0 6px 20px rgba(79,63,247,.4); pointer-events: auto; z-index: 2147483647; transition: transform .3s cubic-bezier(.2,1.2,.4,1); }
.on .pill { transform: translate(-50%,0); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: blink 1.2s infinite; }
.stop { all: unset; cursor: pointer; padding: 5px 11px; font: 600 12px/1 system-ui, sans-serif; color: #4f3ff7; background: #fff; border-radius: 999px; }
.cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; opacity: 0; transition: transform .7s cubic-bezier(.25,.8,.25,1), opacity .25s; }
.cursor svg { display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
.cursor span { position: absolute; left: 18px; top: 16px; padding: 2px 7px; font: 600 11px/1.3 system-ui, sans-serif; color: #fff; background: #4f3ff7; border-radius: 6px; white-space: nowrap; }
.ring { position: fixed; z-index: 2147483645; pointer-events: none; border: 2px solid #4f3ff7; border-radius: 6px; background: rgba(79,63,247,.1); opacity: 0; transition: opacity .25s, left .5s ease, top .5s ease, width .5s ease, height .5s ease; }
/* needs you: amber so it reads as a request, not progress */
.alert .pill { background: #d97706; }
.alert .frame { box-shadow: inset 0 0 0 3px rgba(217,119,6,.8), inset 0 0 44px rgba(217,119,6,.35); }
.alert .stop { color: #d97706; }
@keyframes pulse { 50% { box-shadow: inset 0 0 0 3px rgba(79,63,247,.85), inset 0 0 52px rgba(79,63,247,.4); } }
@keyframes blink { 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { .frame, .dot { animation: none; } .cursor { transition: none; } }
`;

export interface Overlay {
  show(): void;
  hide(): void;
  /** Auto-submit gave up: say so on the page and stay visible until the person acts. */
  needsYou(text?: string): void;
  /** Glide the cursor over these elements one after another (visual only, never blocks). */
  tour(els: Element[]): void;
  /** The cursor moves to this field right before it is filled (the person sees the form being filled). */
  focus(el: Element): Promise<void>;
  /** The cursor glides to a point (a real press is about to land there). */
  pointAt(x: number, y: number): Promise<void>;
}

export function createOverlay(doc: Document, onStop: () => void): Overlay {
  let host: HTMLElement | undefined;
  let root: ShadowRoot | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let tourId = 0;

  const build = () => {
    host = doc.createElement('div');
    root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    const wrap = doc.createElement('div');
    wrap.className = 'wrap';
    const frame = doc.createElement('div');
    frame.className = 'frame';
    const pill = doc.createElement('div');
    pill.className = 'pill';
    const dot = doc.createElement('span');
    dot.className = 'dot';
    const label = doc.createElement('span');
    label.className = 'label';
    label.textContent = 'Plato is working on this tab';
    const stop = doc.createElement('button');
    stop.className = 'stop';
    stop.textContent = 'Stop';
    stop.addEventListener('click', () => {
      api.hide();
      onStop();
    });
    pill.append(dot, label, stop);
    const cursor = doc.createElement('div');
    cursor.className = 'cursor';
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 2l16 9-7 2-3 7z');
    path.setAttribute('fill', '#4f3ff7');
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1.5');
    svg.append(path);
    const tag = doc.createElement('span');
    tag.textContent = 'Plato';
    cursor.append(svg, tag);
    const ring = doc.createElement('div');
    ring.className = 'ring';
    wrap.append(frame, ring, cursor, pill);
    root.append(wrap);
    doc.documentElement.append(host);
  };

  const q = (c: string) => root!.querySelector<HTMLElement>(`.${c}`)!;
  const bump = () => {
    clearTimeout(idle);
    idle = setTimeout(() => api.hide(), 6000); // quiet for 6s: get out of the way
  };

  const api: Overlay = {
    show() {
      if (!host) build();
      if (!host!.isConnected) doc.documentElement.append(host!);
      q('wrap').classList.add('on');
      bump();
    },
    needsYou(text = 'Plato needs you here') {
      api.show();
      clearTimeout(idle); // stay until the person acts
      q('label').textContent = text.slice(0, 80);
      q('wrap').classList.add('alert');
    },
    hide() {
      tourId++;
      clearTimeout(idle);
      if (!root) return;
      q('wrap').classList.remove('on');
      q('cursor').style.opacity = '0';
      q('ring').style.opacity = '0';
    },
    focus(el) {
      api.show();
      tourId++; // a live fill cancels any replay
      const cursor = q('cursor');
      const ring = q('ring');
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return Promise.resolve(); // hidden control (a file input behind a button): nothing to point at
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const r2 = el.getBoundingClientRect();
      cursor.style.opacity = '1';
      cursor.style.transform = `translate(${Math.round(r2.left + Math.min(r2.width / 2, 40))}px, ${Math.round(r2.top + r2.height / 2)}px)`;
      Object.assign(ring.style, { opacity: '1', left: `${r2.left - 3}px`, top: `${r2.top - 3}px`, width: `${r2.width + 6}px`, height: `${r2.height + 6}px` });
      bump();
      return new Promise((resolve) => setTimeout(resolve, typeof __FLAVOR__ !== 'undefined' && __FLAVOR__ === 'fixtures' ? 20 : 750)); // the glide (.7s), then it starts
    },
    pointAt(x, y) {
      api.show();
      tourId++;
      const cursor = q('cursor');
      cursor.style.opacity = '1';
      cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      q('ring').style.opacity = '0';
      bump();
      return new Promise((resolve) => setTimeout(resolve, typeof __FLAVOR__ !== 'undefined' && __FLAVOR__ === 'fixtures' ? 20 : 650));
    },
    tour(els) {
      api.show();
      const id = ++tourId;
      const cursor = q('cursor');
      const ring = q('ring');
      const step = (i: number) => {
        if (id !== tourId || i >= Math.min(els.length, 10)) {
          if (id === tourId) {
            cursor.style.opacity = '0';
            ring.style.opacity = '0';
          }
          return;
        }
        const el = els[i]!;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const r = el.getBoundingClientRect();
        cursor.style.opacity = '1';
        cursor.style.transform = `translate(${Math.round(r.left + Math.min(r.width / 2, 40))}px, ${Math.round(r.top + r.height / 2)}px)`;
        Object.assign(ring.style, { opacity: '1', left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
        bump();
        setTimeout(() => step(i + 1), 520);
      };
      step(0);
    },
  };
  return api;
}
