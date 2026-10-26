// Generic content script. It reads nothing from extension storage, makes no
// network requests, and never sees the extension token. It answers our own
// panel with page facts and fills the form controls it is told to fill, after
// re-checking each one. It never submits: see src/dom/fill.ts.
import { isV3Message, COMBO_OPTIONS, DOM_POINT, GROUP_STATE, isTrustedMessage, FORM_FILE, FORM_FILL, FORM_INSPECT, FORM_LIST, FORM_OPTIONS, FORM_SUBMIT, FORM_VERIFY, isFormMessage, isNeedsYou, isSettleMessage, isSnapMessage, SNAP_TAKE, isPageState, isPing, type PingReply } from '../core/messages';
import { fillFields, probeOptions, readBack, setFile } from '../dom/fill';
import { pageState } from '../dom/page-state';
import { pressRef, takeSnapshot } from '../dom/snapshot';
import { createSettleWatcher } from '../dom/settle';
import { comboOptions, comboVerify, fieldPoint, groupState, optionPoint, refPoint } from '../dom/point';
import { submitForm } from '../dom/submit';
import { inspectForm, listForms } from '../dom/inspect';
import { createOverlay } from './overlay';
import { handle as v3, installGuard } from './v3-reader';

// The person can press Stop on the page; the panel hears it and cancels that job.
const overlay = createOverlay(document, () => void chrome.runtime.sendMessage({ type: 'plato:stop' }));

const settle = createSettleWatcher(document); // watches the page from the moment the script runs
installGuard(document); // engine v3: form submits are cancelled while the executor says so
chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse: (r: unknown) => void) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (isPing(msg)) {
    sendResponse({ ok: true, href: location.href } satisfies PingReply);
    return false;
  }
  if (isV3Message(msg)) {
    overlay.show();
    try {
      const r = v3(document, msg);
      if (!(r instanceof Promise)) return void sendResponse(r), false;
      // `ready` waits for the page; when the control can be pressed, Plato's cursor glides to it first
      void r.then(
        async (v: unknown) => {
          const pt = (v as { ok?: boolean; point?: { x: number; y: number } }).ok ? (v as { point: { x: number; y: number } }).point : null;
          if (pt) await overlay.pointAt(pt.x, pt.y).catch(() => undefined);
          sendResponse(v);
        },
        (e: unknown) => sendResponse({ ok: false, reason: `page error: ${(e as Error).message}`.slice(0, 300) }),
      );
      return true; // answered when the page is ready
    } catch (e) {
      sendResponse({ ok: false, message: `page error: ${(e as Error).message}`.slice(0, 300) });
    }
    return false;
  }
  if (isPageState(msg)) {
    overlay.show(); // the extension is working on this tab: show it (visual only)
    sendResponse(pageState(document));
    return false;
  }
  if (isSnapMessage(msg)) {
    overlay.show();
    sendResponse(msg.type === SNAP_TAKE ? takeSnapshot(document) : pressRef(document, msg.ref));
    return false;
  }
  if (isSettleMessage(msg)) {
    void settle.wait(msg.quietMs, msg.capMs).then((r) => sendResponse(r));
    return true; // answered when the page is ready
  }
  if (isTrustedMessage(msg)) {
    overlay.show();
    const reply = (p: Promise<unknown> | unknown) => void Promise.resolve(p).then((r) => sendResponse(r), () => sendResponse(null));
    if (msg.type === DOM_POINT) {
      // find the point, then let the page cursor glide there before the real press lands
      const found = msg.what === 'ref' ? refPoint(document, msg.ref) : msg.what === 'field' ? fieldPoint(document, msg.formId, msg.fieldId, msg.fp).then((r) => r) : optionPoint(document, msg.formId, msg.fieldId, msg.text);
      reply(
        Promise.resolve(found).then(async (r) => {
          const pt = r && 'point' in (r as object) ? (r as { point: { x: number; y: number } | null }).point : (r as { x: number; y: number } | null);
          if (pt) await overlay.pointAt(pt.x, pt.y);
          return r;
        }),
      );
    }
    else if (msg.type === GROUP_STATE) reply(groupState(document, msg.formId, msg.fieldId));
    else if (msg.type === COMBO_OPTIONS) reply(comboOptions(document, msg.formId, msg.fieldId));
    else reply(comboVerify(document, msg.formId, msg.fieldId, msg.chosen));
    return true;
  }
  if (isNeedsYou(msg)) {
    overlay.needsYou(typeof (msg as { text?: unknown }).text === 'string' ? (msg as { text: string }).text : undefined);
    sendResponse({ ok: true });
    return false;
  }
  if (!isFormMessage(msg)) return false;
  overlay.show();
  try {
    if (msg.type === FORM_LIST) sendResponse(listForms(document, msg.scope));
    else if (msg.type === FORM_INSPECT) sendResponse(inspectForm(document, msg.formId));
    else if (msg.type === FORM_FILL) {
      void fillFields(document, msg.formId, msg.instructions, { before: (el) => overlay.focus(el) }).then(
        (out) => sendResponse(out),
        () => sendResponse({ error: 'failed' }),
      );
      return true; // answered when the fill settles (type-ahead lists need the event loop)
    }
    else if (msg.type === FORM_OPTIONS) {
      void probeOptions(document, msg.formId, msg.fieldIds).then((r) => sendResponse(r), () => sendResponse([]));
      return true;
    }
    else if (msg.type === FORM_FILE) sendResponse(setFile(document, msg.formId, { fieldId: msg.fieldId, fp: msg.fp }, { name: msg.name, mime: msg.mime, bytes: Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0)) }));
    else if (msg.type === FORM_SUBMIT) sendResponse(submitForm(document, msg.formId));
    else if (msg.type === FORM_VERIFY) sendResponse(readBack(document, msg.formId, msg.expected));
  } catch (e) {
    sendResponse({ error: (e as Error).message === 'unknown-form' ? 'unknown-form' : 'failed' });
  }
  return false;
});
