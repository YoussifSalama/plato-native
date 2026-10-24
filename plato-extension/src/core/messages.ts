import type { FieldValue, FillInstruction } from '../dom/types';
import { V3_OPS, type V3Op } from '../content/v3-reader';

// Typed messages between the panel and a content script. Deliberately small:
// nothing here can carry the extension token, and there is no message that
// submits a form except plato:form:submit, which the panel sends only for an auto-submit run. The content script answers with page facts or the result of
// filling the exact fields it was told to fill.
export const PING = 'plato:ping';
export const INSPECT = 'plato:inspect'; // fixtures flavor only (outcome probe)
export const FORM_LIST = 'plato:form:list';
export const FORM_INSPECT = 'plato:form:inspect';
export const FORM_FILL = 'plato:form:fill';
export const FORM_VERIFY = 'plato:form:verify';
export const FORM_SUBMIT = 'plato:form:submit'; // auto-submit only: the panel decides, see dom/submit.ts
export const FORM_FILE = 'plato:form:file'; // put a file (the chosen resume) into one upload field
export const FORM_OPTIONS = 'plato:form:options'; // open comboboxes and read what they offer
export const PAGE_SETTLE = 'plato:page:settle'; // answer when the page is loaded and quiet (no guessed delays)
export const isSettleMessage = (m: unknown): m is { type: typeof PAGE_SETTLE; quietMs?: number; capMs?: number } => {
  const x = m as { type?: unknown; quietMs?: unknown; capMs?: unknown };
  return x?.type === PAGE_SETTLE && (x.quietMs === undefined || (typeof x.quietMs === 'number' && x.quietMs >= 100 && x.quietMs <= 5000)) && (x.capMs === undefined || (typeof x.capMs === 'number' && x.capMs >= 1000 && x.capMs <= 60_000));
};
// Trusted input (the panel presses with real CDP events): where things are, what they show.
export const DOM_POINT = 'plato:dom:point';
export const GROUP_STATE = 'plato:dom:group';
export const COMBO_OPTIONS = 'plato:dom:combo-options';
export const COMBO_VERIFY = 'plato:dom:combo-verify';
export type TrustedMessage =
  | { type: typeof DOM_POINT; what: 'field'; formId: string; fieldId: string; fp: string }
  | { type: typeof DOM_POINT; what: 'ref'; ref: string }
  | { type: typeof DOM_POINT; what: 'option'; formId: string; fieldId: string; text: string }
  | { type: typeof GROUP_STATE; formId: string; fieldId: string }
  | { type: typeof COMBO_OPTIONS; formId: string; fieldId: string }
  | { type: typeof COMBO_VERIFY; formId: string; fieldId: string; chosen: string };
export const isTrustedMessage = (m: unknown): m is TrustedMessage => {
  const t = typeOf(m);
  const x = m as { what?: unknown; formId?: unknown; fieldId?: unknown; fp?: unknown; ref?: unknown; text?: unknown; chosen?: unknown };
  if (t === DOM_POINT) {
    if (x.what === 'ref') return typeof x.ref === 'string' && /^e\d{1,3}$/.test(x.ref);
    if (x.what === 'field') return str(x.formId, 40) && str(x.fieldId, 40) && str(x.fp, 16);
    if (x.what === 'option') return str(x.formId, 40) && str(x.fieldId, 40) && str(x.text, 200);
    return false;
  }
  if (t === GROUP_STATE || t === COMBO_OPTIONS) return str(x.formId, 40) && str(x.fieldId, 40);
  if (t === COMBO_VERIFY) return str(x.formId, 40) && str(x.fieldId, 40) && str(x.chosen, 200);
  return false;
};
export const PAGE_STATE = 'plato:page:state'; // read-only page facts for provider adapters
export const SNAP_TAKE = 'plato:snap:take'; // AI planner: read the page (controls, text), never values
export const SNAP_PRESS = 'plato:snap:press'; // AI planner: press one control from the latest snapshot
export const NEEDS_YOU = 'plato:needs-you'; // overlay text only

export type PingMessage = { type: typeof PING };
export type PingReply = { ok: true; href: string };
export type FormListMessage = { type: typeof FORM_LIST; scope?: 'dialog' };
export type FormInspectMessage = { type: typeof FORM_INSPECT; formId: string };
export type FormFillMessage = { type: typeof FORM_FILL; formId: string; instructions: FillInstruction[] };
export type ExpectedField = { fieldId: string; fp: string; value: FieldValue };
export type FormVerifyMessage = { type: typeof FORM_VERIFY; formId: string; expected: ExpectedField[] };
export type FormSubmitMessage = { type: typeof FORM_SUBMIT; formId: string };
export type FormFileMessage = { type: typeof FORM_FILE; formId: string; fieldId: string; fp: string; name: string; mime: string; data: string }; // data: base64
export type FormOptionsMessage = { type: typeof FORM_OPTIONS; formId: string; fieldIds: string[] };
export type FormMessage = FormListMessage | FormInspectMessage | FormFillMessage | FormVerifyMessage | FormSubmitMessage | FormFileMessage | FormOptionsMessage;
export const isPageState = (m: unknown): boolean => typeOf(m) === PAGE_STATE;
export type SnapMessage = { type: typeof SNAP_TAKE } | { type: typeof SNAP_PRESS; ref: string };
export const isSnapMessage = (m: unknown): m is SnapMessage => {
  const t = typeOf(m);
  return t === SNAP_TAKE || (t === SNAP_PRESS && typeof (m as { ref?: unknown }).ref === 'string' && /^e\d{1,3}$/.test((m as { ref: string }).ref));
};
export const isNeedsYou = (m: unknown): boolean => typeOf(m) === NEEDS_YOU;
// Engine v3: the page reader (content/v3-reader.ts). One message type, the op inside; refs and values are bounded.
export const V3 = 'plato:v3';
export const isV3Message = (m: unknown): m is V3Op & { type: typeof V3 } => {
  if (typeOf(m) !== V3) return false;
  const x = m as { op?: unknown; ref?: unknown; query?: unknown; value?: unknown; data?: unknown; ms?: unknown; x?: unknown; y?: unknown; filter?: unknown };
  if (typeof x.op !== 'string' || !V3_OPS.has(x.op)) return false;
  const refOk = x.ref === undefined || x.ref === null || (typeof x.ref === 'string' && /^ref_\d{1,5}$/.test(x.ref));
  if (!refOk) return false;
  if (x.op === 'form_input' || x.op === 'resolve' || x.op === 'set_file') return typeof x.ref === 'string';
  if (x.op === 'find') return str(x.query, 300);
  if (x.op === 'guard') return typeof x.ms === 'number' && x.ms >= 0 && x.ms <= 5000;
  if (x.op === 'describe') return typeof x.ref === 'string' || (typeof x.x === 'number' && typeof x.y === 'number');
  return true;
};

const typeOf = (m: unknown) => (typeof m === 'object' && m !== null ? (m as { type?: unknown }).type : undefined);
export const isPing = (m: unknown): m is PingMessage => typeOf(m) === PING;

const str = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const value = (v: unknown) => typeof v === 'boolean' || (typeof v === 'string' && v.length <= 2000) || (Array.isArray(v) && v.length <= 60 && v.every((x) => typeof x === 'string' && x.length <= 200)); // string[]: a tick list
const isInstruction = (i: unknown): i is FillInstruction => {
  const x = i as FillInstruction | null;
  return typeof x === 'object' && x !== null && str(x.fieldId, 40) && str(x.fp, 16) && str(x.vh, 16) && value(x.value) && (x.kind === undefined || str(x.kind, 20));
};
const isExpected = (i: unknown): i is ExpectedField => {
  const x = i as ExpectedField | null;
  return typeof x === 'object' && x !== null && str(x.fieldId, 40) && str(x.fp, 16) && value(x.value);
};
const many = <T>(v: unknown, ok: (i: unknown) => i is T): v is T[] => Array.isArray(v) && v.length <= 200 && v.every(ok);

export const isFormMessage = (m: unknown): m is FormMessage => {
  const t = typeOf(m);
  const x = m as { formId?: unknown; instructions?: unknown; expected?: unknown; scope?: unknown };
  if (t === FORM_LIST) return x.scope === undefined || x.scope === 'dialog';
  if (t === FORM_INSPECT) return str(x.formId, 40);
  if (t === FORM_FILL) return str(x.formId, 40) && many(x.instructions, isInstruction);
  if (t === FORM_SUBMIT) return str(x.formId, 40);
  if (t === FORM_VERIFY) return str(x.formId, 40) && many(x.expected, isExpected);
  if (t === FORM_OPTIONS) {
    const o = m as FormOptionsMessage;
    return str(o.formId, 40) && Array.isArray(o.fieldIds) && o.fieldIds.length <= 60 && o.fieldIds.every((f) => str(f, 40));
  }
  if (t === FORM_FILE) {
    const f = m as FormFileMessage;
    return str(f.formId, 40) && str(f.fieldId, 40) && str(f.fp, 16) && str(f.name, 200) && str(f.mime, 100) && str(f.data, 12_000_000);
  }
  return false;
};
