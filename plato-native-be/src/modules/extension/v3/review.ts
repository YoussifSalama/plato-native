import { z } from 'zod';
import { REVIEW_SOURCES, type Review, type ReviewField, type ReviewSource, type SensitiveCategory } from './v3-contract';

// Review before Submit: the field list the model sends with SUBMIT_READY, checked against the sources the backend
// itself gave the model. The model's claimed source is a claim; `verified` is what the backend found. Pure: no I/O.

export type SubmitMode = 'auto' | 'review';
/** A keyed source line: a saved answer ("question" -> value), a PROFILE line ("Key: value"), or the seeker's words here. */
export interface Entry {
  key?: string;
  value: string;
}
export interface ReviewContext {
  cv: string; // the CV text (and the CV JSON the prompt carried)
  answers: Entry[]; // apply_answers, apply_facts, and what the seeker said in this conversation
  profile: Entry[]; // the PROFILE block the prompt was given, one entry per line
  job: string; // title, company, location, description as the prompt had them
  today: string; // yyyy-mm-dd
  coverLetter: boolean; // the seeker's settings allow a written cover letter
  resumeUploaded: boolean; // a file_upload ran in this session (only the staged resume can be uploaded: refuse())
}

export const REASK = 'List every field you filled as the JSON block, then SUBMIT_READY again.';

const claimedSchema = z.object({
  label: z.string().trim().min(1).max(300),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).transform((v) => (Array.isArray(v) ? v.join(', ') : String(v)).slice(0, 4000)),
  // a source outside the six is no source at all
  source: z.preprocess((v) => {
    const s = (typeof v === 'string' ? v : '').trim().toLowerCase();
    return (REVIEW_SOURCES as readonly string[]).includes(s) ? s : 'guess';
  }, z.enum(REVIEW_SOURCES)),
  evidence: z.string().max(2000).optional().nullable().transform((v) => v?.trim().slice(0, 300) || undefined),
});
export type ClaimedField = { label: string; value: string; source: ReviewSource; evidence?: string };
const listSchema = z.object({ fields: z.array(claimedSchema).max(150) });

/** The ```json {"fields":[…]} block after the last SUBMIT_READY (or a bare object). null = missing or invalid. */
export function parseFieldList(text: string): ClaimedField[] | null {
  const at = text.search(/SUBMIT_READY(?![\s\S]*SUBMIT_READY)/i);
  const body = at >= 0 ? text.slice(at) : text;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  const open = body.indexOf('{');
  const raw = fence?.[1] ?? (open >= 0 ? body.slice(open, body.lastIndexOf('}') + 1) : '');
  if (!raw) return null;
  try {
    const p = listSchema.safeParse(JSON.parse(raw));
    return p.success ? p.data.fields : null;
  } catch {
    return null;
  }
}

// ---- normalising ------------------------------------------------------------

const asciiDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
/** Case, punctuation, spacing; Arabic diacritics and letter variants; "3,000" -> "3000". */
export const norm = (s: string) =>
  asciiDigits(s.normalize('NFKC'))
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/(\d)[,٬](?=\d{3}(?!\d))/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const tokens = (s: string) => norm(s).split(' ').filter(Boolean);
const STOP = new Set(['the', 'you', 'your', 'are', 'and', 'for', 'with', 'this', 'that', 'have', 'will', 'can', 'our', 'any', 'what', 'which', 'please', 'هل', 'في', 'من', 'علي', 'الي', 'ما', 'هو', 'هي']);
const content = (s: string) => tokens(s).filter((t) => !STOP.has(t) && !/^\d+$/.test(t) && t.length >= 2);

/** Every whole number the text states, also with its thousands or phone separators taken out. */
function numbersIn(text: string): Set<string> {
  const t = asciiDigits(text);
  const runs = (s: string) => s.match(/\d+/g) ?? [];
  return new Set([...runs(t), ...runs(t.replace(/(\d)[,.٬](?=\d{3}(?!\d))/g, '$1')), ...runs(t.replace(/(\d)[\s\-().]+(?=\d)/g, '$1'))]);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const pad = (n: number) => String(n).padStart(2, '0');
/** The dates a text states, as yyyy-mm-dd and yyyy-mm keys. dd/mm and mm/dd are both kept when both are valid. */
export function dateKeys(text: string): Set<string> {
  const t = asciiDigits(text).toLowerCase();
  const out = new Set<string>();
  const add = (y: number, m: number, d?: number) => {
    if (m < 1 || m > 12 || y < 1900 || y > 2100 || (d !== undefined && (d < 1 || d > 31))) return;
    out.add(`${y}-${pad(m)}`);
    if (d !== undefined) out.add(`${y}-${pad(m)}-${pad(d)}`);
  };
  const each = (re: string, f: (g: string[]) => void) => {
    for (const x of t.matchAll(new RegExp(re, 'g'))) f(x.slice(1));
  };
  each('\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b', ([y, m, d]) => add(+y, +m, +d));
  each('\\b(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})\\b', ([a, b, y]) => (add(+y, +a, +b), add(+y, +b, +a)));
  each('\\b(\\d{4})[-/.](\\d{1,2})\\b(?![-/.]\\d)', ([y, m]) => add(+y, +m));
  each('(?<![\\d/.-])(\\d{1,2})[-/.](\\d{4})\\b', ([m, y]) => add(+y, +m));
  each(`\\b${MON}\\s+(?:(\\d{1,2})(?:st|nd|rd|th)?,?\\s+)?(\\d{4})\\b`, ([mon, d, y]) => add(+y, MONTHS.indexOf(mon) + 1, d ? +d : undefined));
  each(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON},?\\s+(\\d{4})\\b`, ([d, mon, y]) => add(+y, MONTHS.indexOf(mon) + 1, +d));
  return out;
}
/** The value is a date and nothing else ("03/2019", "26 Nov 2026"). */
const onlyDate = (v: string) => dateKeys(v).size > 0 && !/[\p{L}\p{N}]/u.test(asciiDigits(v).toLowerCase().replace(new RegExp(MON, 'g'), '').replace(/\d+(st|nd|rd|th)?/g, ''));

const YES = new Set(['yes', 'y', 'true', 'نعم', 'اجل']);
const NO = new Set(['no', 'n', 'false', 'لا']);
/** Yes / No by the leading word ("No, I do not need sponsorship" is No); undefined = not a yes/no answer. */
export const polarity = (v: string): boolean | undefined => {
  const first = tokens(v)[0];
  return first === undefined ? undefined : YES.has(first) ? true : NO.has(first) ? false : undefined;
};

/** The value is stated in the text: dates and numbers exactly, a short value as a phrase, a long one by strong overlap. */
export function foundIn(value: string, text: string): boolean {
  if (!value.trim() || !text.trim()) return false;
  if (onlyDate(value)) {
    const have = dateKeys(text);
    return [...dateKeys(value)].some((k) => have.has(k));
  }
  const vt = tokens(value);
  if (!vt.length) return false;
  const nums = vt.filter((x) => /^\d+$/.test(x));
  if (nums.length) {
    const have = numbersIn(text);
    if (!nums.every((n) => have.has(n))) return false;
    if (vt.length - nums.length <= 3) return true; // "3000 USD per month": the number is the fact, the rest its unit
  }
  if (vt.length <= 4) return ` ${norm(text)} `.includes(` ${vt.join(' ')} `);
  const words = [...new Set(content(value))];
  if (!words.length) return false;
  const have = new Set(tokens(text));
  return words.filter((w) => have.has(w)).length / words.length >= 0.8;
}

/** The label and a source line's key talk about the same thing ("authorized to work" ~ "Work authorization"). */
const sameTopic = (label: string, key: string) => {
  const a = content(label);
  const b = content(key);
  return a.some((x) => b.some((y) => x === y || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5))));
};

/** A keyed source holds the value. A bare Yes / No only counts from a line about the same question. */
function inEntries(label: string, value: string, entries: Entry[]): boolean {
  const pol = polarity(value);
  if (pol !== undefined) return entries.some((e) => polarity(e.value) === pol && (e.key ? sameTopic(label, e.key) : tokens(e.value).length === tokens(value).length));
  return entries.some((e) => foundIn(value, e.value));
}

// ---- rules the RULES make the model fill itself -------------------------------

const RULE_FILLS: { label: RegExp; ok: (v: string, c: ReviewContext) => boolean }[] = [
  { label: /postal|\bzip\b|post ?code|الرمز البريدي|رمز بريدي/, ok: (v) => /^[a-z0-9 -]{3,10}$/i.test(v.trim()) },
  { label: /availab|start date|start on|earliest start|when can you start|joining date|تاريخ (البدء|المباشره|الالتحاق)|متي يمكنك/, ok: (v, c) => dateKeys(v).has(c.today) },
  { label: /location|office|city|site|مكان|موقع|مدينه|فرع/, ok: (v, c) => foundIn(v, c.job) },
  { label: /cover letter|motivation|رساله (تغطيه|تحفيزيه)|خطاب (التقديم|تغطيه)/, ok: (v, c) => c.coverLetter && v.trim().length > 0 },
];
// lower case and Arabic letter variants only: the label regexes below need their spaces and hyphens
const labelText = (label: string) =>
  label.normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

// ---- sensitive questions, by the label (the model's say does not count) --------

const SENSITIVE: [SensitiveCategory, RegExp][] = [
  ['pay', /\b(salary|salaries|compensation|pay|wages?|ctc)\b|\brates?\b(?!\s+your)|راتب|رواتب|(^|\s)(ال)?اجر(?!ا)|تعويض|مرتب/],
  ['work_auth', /authori[sz]\w*\b.*\bwork\b|work authori[sz]|eligib\w* to work|right to work|work permit|legally (able|permitted|allowed) to work|تصريح (عمل|العمل)|مصرح|يحق لك العمل|اذن عمل/],
  ['sponsorship', /\bvisas?\b|sponsor|تاشيره|كفاله|كفيل/],
  ['legal', /criminal|convict|felon|misdemeanou?r|background check|non-?compete|جنائي|ادانه|سوابق|صحيفه الحاله الجنائيه|عدم المنافسه|التحقق من الخلفيه/],
  ['demographic', /gender|\bsex\b|\brace\b|racial|ethnic|disabilit|disabled|veteran|pronoun|الجنس|النوع الاجتماعي|العرق|عرقي|اعاقه|الاعاقه|محارب|المحاربين القدامي/],
];
export function sensitivity(label: string): SensitiveCategory | undefined {
  const l = labelText(label);
  return SENSITIVE.find(([, re]) => re.test(l))?.[0];
}

const FILE = /\.(pdf|docx?|rtf|odt|txt)$/i;

/** The value itself is in the claimed source. */
function valueOk(f: ClaimedField, c: ReviewContext): boolean {
  switch (f.source) {
    case 'cv':
      return polarity(f.value) === undefined && foundIn(f.value, c.cv); // a CV states facts, never a Yes or a No
    case 'answer':
      return inEntries(f.label, f.value, c.answers);
    case 'profile':
      return inEntries(f.label, f.value, c.profile);
    case 'job':
      return foundIn(f.value, c.job);
    case 'rule': {
      const l = labelText(f.label);
      return RULE_FILLS.some((r) => r.label.test(l) && r.ok(f.value, c));
    }
    case 'guess':
      return false;
  }
}

const lines = (es: Entry[]) => es.map((e) => (e.key ? `${e.key}: ${e.value}` : e.value)).join('\n');
/** The text an evidence quote is looked up in. Saved answers also as PROFILE shows them ("Answered before: …"). */
function sourceText(source: ReviewSource, c: ReviewContext): string | null {
  if (source === 'cv') return c.cv;
  if (source === 'job') return c.job;
  if (source === 'profile') return lines(c.profile);
  if (source === 'answer') return `${lines(c.answers)}\n${lines(c.profile.filter((e) => /^(Answered before|Seeker's answer for forms)\b/.test(e.key ?? '')))}`;
  return null;
}
const phraseIn = (quote: string, text: string) => !!norm(quote) && ` ${norm(text)} `.includes(` ${norm(quote)} `);

function verify(f: ClaimedField, c: ReviewContext, sensitive: boolean): boolean {
  if (f.source === 'cv' && FILE.test(f.value.trim())) return c.resumeUploaded;
  const direct = valueOk(f, c);
  const text = f.evidence ? sourceText(f.source, c) : null;
  if (!f.evidence || text === null) return direct;
  // The quote the model relied on: it backs a Yes/No or a derived value, but a number only when the quote holds that
  // number. A sensitive field still needs its value itself in the source.
  const quoted = phraseIn(f.evidence, text);
  const nums = onlyDate(f.value) ? [] : tokens(f.value).filter((t) => /^\d+$/.test(t));
  if (nums.length) {
    const inQuote = numbersIn(f.evidence);
    return quoted && nums.every((n) => inQuote.has(n)) && (!sensitive || direct);
  }
  if (sensitive) return direct;
  // A quote backs a bare Yes/No (the CV states the fact, not the word), or a value the quote itself contains. A real
  // quote never verifies a different answer ("heard via LinkedIn" does not back "Social media").
  const backs = YES_NO.test(norm(f.value)) || phraseIn(f.value, f.evidence);
  return direct || (quoted && backs);
}
const YES_NO = /^(yes|no|y|n|true|false|نعم|لا|اه|ايوه)$/;

export function checkField(f: ClaimedField, c: ReviewContext): ReviewField {
  const category = sensitivity(f.label);
  const verified = verify(f, c, !!category);
  return {
    label: f.label,
    value: f.value.slice(0, 2000),
    source: f.source,
    ...(f.evidence && { evidence: f.evidence }),
    verified,
    status: f.source === 'guess' ? 'guess' : verified ? 'ok' : 'unverified',
    sensitive: !!category,
    ...(category && { category }),
  };
}

/** The review the extension shows (or not) before Submit. `fields` null = the model never sent a valid list. */
export function buildReview(fields: ClaimedField[] | null, c: ReviewContext, mode: SubmitMode): Review {
  const checked = (fields ?? []).map((f) => checkField(f, c));
  const complete = fields !== null;
  const holdReason: Review['holdReason'] =
    mode === 'review' ? 'review_mode' : !complete ? 'no_list' : checked.some((f) => f.sensitive && f.status !== 'ok') ? 'sensitive' : undefined;
  return { fields: checked, complete, hold: !!holdReason, ...(holdReason && { holdReason }) };
}

/** PROFILE text -> keyed entries: `Key: value`, or `Seeker's answer for forms: "question": value`. */
export const profileEntries = (summary: string): Entry[] =>
  summary
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = /^(.*?"[^"]*"|[^:]*):\s(.*)$/.exec(l);
      return m ? { key: m[1], value: m[2] } : { value: l };
    });

/** What the seeker typed in this conversation: their structured answers, and each "label: value" part of their text. */
export const saidEntries = (text: string | undefined, answers: { label: string; value: string }[] | undefined): Entry[] => [
  ...(answers ?? []).map((a) => ({ key: a.label, value: a.value })),
  ...(text ?? '')
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((seg) => {
      const i = seg.lastIndexOf(':');
      return i > 0 && seg.slice(i + 1).trim() ? { key: seg.slice(0, i), value: seg.slice(i + 1).trim() } : { value: seg };
    }),
];
