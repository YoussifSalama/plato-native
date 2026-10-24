// Provider-agnostic form model. Nothing here names a site. Values never appear
// in FieldInfo: the inspector reports only whether a field already has one.

export type FieldKind = 'text' | 'email' | 'tel' | 'number' | 'date' | 'url' | 'select' | 'checkbox' | 'checkbox-group' | 'radio' | 'combobox' | 'file' | 'richtext';

export interface FieldOption {
  value: string;
  label: string;
  disabled: boolean;
  placeholder: boolean; // "Select…" style entry with an empty value
}

export interface FieldInfo {
  id: string;
  /** Which form this field belongs to. Selections and approvals never cross forms. */
  formId: string;
  /**
   * Fingerprint of everything that decides whether a mapping is still valid:
   * form, kind, type, label (+source), required, autocomplete, options. A field
   * id alone is never proof a target is the one the person reviewed.
   */
  fp: string;
  /** Hash of the current value (never the value itself): detects edits by the person or the page. */
  vh: string;
  kind: FieldKind;
  type: string; // the native type / tag, for diagnostics
  label: string;
  labelSource: 'aria-labelledby' | 'label-for' | 'label-wrap' | 'aria-label' | 'legend' | 'box' | 'title' | 'placeholder' | 'name' | 'none';
  autocomplete: string | null;
  required: boolean;
  hasValue: boolean;
  options?: FieldOption[];
  /** When the whole page is reviewed (several forms): the label of the form this field sits in, so the AI can tell "Apply" from "Refer a friend". */
  form?: string;
  /** The control's name or id, when it has one (an upload called "resume" is a resume whatever its label says). */
  name?: string;
  // Another visible field carries the same label: filling either is a guess.
  duplicateLabelWith?: string[];
  /** The page's own error text for this field (aria-errormessage / aria-describedby / an error node in the field's box), when shown. */
  error?: string;
}

export interface UnsupportedField {
  id: string;
  label: string;
  required: boolean;
  reason: string; // e.g. textarea, unsupported-type:date, custom-control:combobox, typeahead
}

export interface FormInfo {
  id: string;
  label: string;
  fieldCount: number; // fields the engine could fill
  unsupportedCount: number;
  sample: string[]; // first few field labels, to tell forms apart
}
export interface FormList {
  forms: FormInfo[];
  /** The form to use, only when it is certain. null = the person must choose. */
  selected: string | null;
}

export interface Inspection {
  formId: string;
  fields: FieldInfo[];
  unsupported: UnsupportedField[];
  sensitiveExcluded: number; // password / OTP / payment / ID fields: counted, never described
  hidden: number; // not visible or disabled: not described
  formCount: number;
}

export type FieldValue = string | boolean | string[]; // string[]: the ticked options of a checkbox group
export interface FillInstruction {
  fieldId: string;
  fp: string; // fingerprint the person approved
  vh: string; // value hash the person saw: the field must still hold exactly this
  value: FieldValue;
  kind?: FieldKind; // so the panel can press comboboxes / boxes with trusted input instead
}
export interface FillResult {
  fieldId: string;
  status: 'filled' | 'failed';
  reason?: string; // too-long, invalid:pattern, page-rejected, value-mismatch, no-such-field, ineligible, stale-field, user-edited, no-option, not-fillable
  shown?: string; // what the page ended up displaying, when it differs
  vh?: string; // value hash after the attempt (a failed attempt restores the old value, so this is the baseline for a retry)
  fp?: string;
}
export interface FillOutcome {
  results: FillResult[];
  submitAttempts: number; // blocked submit events during the fill; must be 0
}

// The identity details the common-field mapper may use. No answers, no resume.
export interface Profile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  currentCompany?: string;
}
export type ProfileKey = keyof Profile;

export type HeldReason =
  | 'ambiguous'
  | 'low-confidence'
  | 'unmapped'
  | 'duplicate-label'
  | 'duplicate-key'
  | 'already-filled'
  | 'no-profile-value'
  | 'no-matching-option'
  | 'needs-you'; // consent / choices: only the person decides

export interface Mapping {
  fieldId: string;
  key: ProfileKey;
  value: FieldValue;
  confidence: number;
  why: string;
}
export interface Held {
  fieldId: string;
  reason: HeldReason;
  candidates?: ProfileKey[];
  /** Offered only for a single low-confidence candidate: the person may choose Use (default Skip). */
  proposal?: Mapping;
}
