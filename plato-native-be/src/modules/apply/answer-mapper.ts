import {
  Answers,
  AnswerValue,
  Candidate,
  FormField,
  FormSchema,
  PendingQuestion,
} from './apply.types';
import { declineOption, intakeFor, matchOption } from './intake';

// Deterministic half of answering a form: facts we hold are mapped straight
// onto fields, TYPED for the field, no model involved. Whatever is left is a
// *question* for the drafting agent. Nothing here ever invents a fact.

export const normalizeLabel = (label: string) =>
  label
    .toLowerCase()
    .replace(/\(required\)|\*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const isEmpty = (v: AnswerValue | undefined) =>
  v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

const isNumber = (v: string) => /^\d+(\.\d+)?$/.test(v);
const isDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export const isUrl = (v: string) => {
  try {
    return /^https?:$/.test(new URL(v).protocol) && v.includes('.');
  } catch {
    return false;
  }
};

// Does this value fit this field? The single gate every answer passes,
// whatever produced it (profile, answer bank, model, the seeker).
export function fits(field: FormField, value: AnswerValue): boolean {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'choice':
      return typeof value === 'string' && !!field.options?.includes(value);
    case 'multi':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => field.options?.includes(v))
      );
    case 'number':
      return typeof value === 'string' && isNumber(value);
    case 'date':
      return typeof value === 'string' && isDate(value);
    case 'url':
      return typeof value === 'string' && isUrl(value);
    case 'email':
      return typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value);
    default:
      return typeof value === 'string' && value.trim().length > 0;
  }
}

// --- Typed facts ---------------------------------------------------------

const CURRENCIES: [RegExp, string][] = [
  [/\busd\b|\$|\bdollars?\b/i, 'USD'],
  [/\beur\b|€|\beuros?\b/i, 'EUR'],
  [/\bgbp\b|£|\bpounds?\b/i, 'GBP'],
  [/\begp\b|\ble\b|egyptian pound/i, 'EGP'],
  [/\baed\b|dirhams?/i, 'AED'],
  [/\bsar\b|riyals?/i, 'SAR'],
  [/\binr\b|₹|rupees?|lakhs?|\blpa\b/i, 'INR'],
  [/\bphp\b|pesos?/i, 'PHP'],
];
const currencyIn = (label: string) =>
  CURRENCIES.find(([re]) => re.test(label))?.[1] ?? null;

type Period = 'MONTHLY' | 'YEARLY' | 'HOURLY';
const periodIn = (label: string): Period | null =>
  /\bhour(ly)?\b/i.test(label)
    ? 'HOURLY'
    : /\b(year(ly)?|annual(ly)?|annum|p\.?a\.?)\b/i.test(label)
      ? 'YEARLY'
      : /\bmonth(ly)?\b/i.test(label)
        ? 'MONTHLY'
        : null;

// A salary the way THIS question wants it. Periods convert; currencies
// never do (no exchange rates, and a wrong number is worse than none).
function salaryAnswer(
  field: FormField,
  amount: number | null,
  c: Candidate,
): string | undefined {
  if (amount == null) return undefined;
  const ours = c.preferences.salaryCurrency;
  const asked = currencyIn(field.label);
  const from: Period =
    c.preferences.salaryPeriod === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const to = periodIn(field.label) ?? from;
  if (to === 'HOURLY') return undefined; // a different fact: hourly_rate
  const value = Math.round(
    from === to ? amount : to === 'YEARLY' ? amount * 12 : amount / 12,
  );
  if (field.type === 'number')
    // A bare number can't carry its currency: only safe when it matches.
    return asked && ours && asked !== ours ? undefined : String(value);
  return `${value} ${ours ?? ''} per ${to === 'YEARLY' ? 'year' : 'month'}`.replace(
    /\s+/g,
    ' ',
  );
}

const NOTICE: Record<string, { days: number; text: string }> = {
  immediately: { days: 0, text: 'Immediately' },
  two_weeks: { days: 14, text: '2 weeks' },
  one_month: { days: 30, text: '1 month' },
  three_plus_months: { days: 90, text: '3 months' },
};

function noticeAnswer(field: FormField, c: Candidate): string | undefined {
  const n = c.preferences.availability
    ? NOTICE[c.preferences.availability]
    : null;
  if (!n) return undefined;
  if (field.type !== 'number') return n.text;
  // The unit comes from the question; days when it doesn't say.
  if (/\bmonths?\b/i.test(field.label)) return String(Math.round(n.days / 30));
  if (/\bweeks?\b/i.test(field.label)) return String(Math.round(n.days / 7));
  return String(n.days);
}

// "How many years of experience do you have?" — but NOT "...with Java",
// which is a judgment about one skill and goes to the drafting agent.
const TOTAL_YEARS =
  /^(what is your )?(total )?(number of )?years of (professional |work |relevant |total )?experience\s*\??$|total years of experience|years of experience do you (currently )?have\s*\??$/i;

// --- Languages -------------------------------------------------------------
// A language level is a fact from the profile's language list. A language
// that isn't there is NOT spoken: the honest answer is the form's lowest
// option, never a guess (a model once answered "C1" for Polish).

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LANGUAGES =
  /\b(english|arabic|polish|german|french|spanish|portuguese|italian|dutch|turkish|russian|ukrainian|hindi|chinese|mandarin|japanese|korean|hebrew|swedish|norwegian|danish|finnish|greek|czech|romanian|hungarian)\b/i;

// Profile wording -> CEFR. Conservative: "professional" is B2, not C1.
export function cefrOf(proficiency: string | null): string | null {
  if (!proficiency) return null;
  const literal = /\b([ABC][12])\b/i.exec(proficiency)?.[1];
  if (literal) return literal.toUpperCase();
  if (/native|mother tongue|bilingual/i.test(proficiency)) return 'C2';
  if (/fluent|full professional|advanced|proficient/i.test(proficiency))
    return 'C1';
  if (/profession|upper[- ]?intermediate|very good/i.test(proficiency))
    return 'B2';
  if (/intermediate|limited working|conversational|good/i.test(proficiency))
    return 'B1';
  if (/elementary|basic|beginner/i.test(proficiency)) return 'A2';
  return null;
}

// The option that contains a level: "B2", "C1 or higher", "B1 or lower",
// "C2 / native". `level` null = the language isn't spoken at all.
export function languageOption(
  options: string[],
  level: string | null,
): string | undefined {
  const rank = (l: string) => CEFR.indexOf(l.toUpperCase());
  const parsed = options.map((text) => {
    const at = /\b([ABC][12])\b/i.exec(text)?.[1];
    return {
      text,
      at: at ? rank(at) : -1,
      up: /or (higher|above|better)|\+/i.test(text),
      down: /or (lower|below|less)/i.test(text),
      none: /\b(none|no knowledge|not at all|do(n't| not) speak|beginner|basic)\b/i.test(
        text,
      ),
    };
  });
  if (level === null)
    return (
      parsed.find((o) => o.none)?.text ??
      // Lowest bucket that explicitly reaches down ("B1 or lower").
      parsed.filter((o) => o.down).sort((a, b) => a.at - b.at)[0]?.text
    );
  const want = rank(level);
  return (
    parsed.find((o) => o.at === want && !o.up && !o.down)?.text ??
    parsed.find((o) => o.at === want)?.text ??
    parsed.filter((o) => o.up && o.at <= want).sort((a, b) => b.at - a.at)[0]
      ?.text ??
    parsed.filter((o) => o.down && o.at >= want).sort((a, b) => a.at - b.at)[0]
      ?.text
  );
}

function languageAnswer(f: FormField, c: Candidate): AnswerValue | undefined {
  const name = LANGUAGES.exec(f.label)?.[1].toLowerCase();
  if (!name) return undefined;
  const known = c.languages.find((l) =>
    l.language.toLowerCase().includes(name),
  );
  if (f.type === 'choice')
    return languageOption(
      f.options ?? [],
      known ? cefrOf(known.proficiency) : null,
    );
  if (f.type === 'text' || f.type === 'paragraph')
    return known
      ? (known.proficiency ?? undefined)
      : `I don't speak ${name[0].toUpperCase()}${name.slice(1)}.`;
  return undefined;
}

// --- Consent and "how did you hear" ---------------------------------------
// Rules, not judgment calls for a model.
const option = (f: FormField, re: RegExp) => f.options?.find((o) => re.test(o));

interface Resolver {
  test: (field: FormField, label: string) => boolean;
  value: (c: Candidate, field: FormField) => AnswerValue | undefined;
}

const link = (v?: string) => (v && isUrl(v) ? v : undefined);

// Order matters: specific before general ("current salary" before "salary").
const RESOLVERS: Resolver[] = [
  {
    // Marketing / newsletters / talent pools: never opted into on someone's
    // behalf. Checked before the data-processing rule: both say "consent".
    test: (f, l) =>
      (f.type === 'choice' || f.type === 'boolean') &&
      /\b(marketing|newsletter|promotion|direct e ?mail|future (job )?opportunit|talent (pool|community)|news and updates|keep (me|my)|stay in touch)\b/.test(
        l,
      ),
    value: (_c, f) =>
      f.type === 'boolean'
        ? false
        : option(f, /^no\b|no,? thanks|not now|do(n't| not)/i),
  },
  {
    // Processing the application's personal data is what applying IS
    // (covered by Plato's terms). Refusing it means the form rejects you.
    test: (f, l) =>
      (f.type === 'choice' || f.type === 'boolean') &&
      /\b(agree|consent|acknowledge|accept)\b/.test(l) &&
      /\b(personal data|data (will be )?process|privacy (policy|notice)|recruitment process|gdpr)\b/.test(
        l,
      ),
    value: (_c, f) =>
      f.type === 'boolean'
        ? true
        : option(f, /^(yes|i agree|agree|accept|i consent)\b/i),
  },
  {
    // Plato found the posting on the employer's public job board.
    test: (f, l) =>
      f.type === 'choice' &&
      /how did you (hear|find out|learn|come to know) about|where did you (hear|find|see)/.test(
        l,
      ),
    value: (_c, f) =>
      option(f, /job board|job site|aggregator/i) ?? option(f, /^other\b/i),
  },
  {
    test: (f) =>
      LANGUAGES.test(f.label) &&
      /\b(level|proficien|fluen|how well|speak)/i.test(f.label),
    value: (c, f) => languageAnswer(f, c),
  },
  {
    test: (_f, l) =>
      /\bcurrent\b.*\b(salary|compensation|package|ctc|pay)\b/.test(l),
    value: (c, f) => {
      const fact = Number(c.facts.current_salary);
      return salaryAnswer(
        f,
        Number.isFinite(fact) && fact > 0 ? fact : null,
        c,
      );
    },
  },
  {
    test: (_f, l) =>
      /\b(expected|desired|target|salary expectations?|compensation expectations?)\b.*\b(salary|compensation|package|pay|rate)?\b/.test(
        l,
      ) && /\b(salary|compensation|package|pay|expectations?)\b/.test(l),
    // One number: the target. A range in a number field becomes garbage.
    value: (c, f) =>
      salaryAnswer(f, c.preferences.salaryMax ?? c.preferences.salaryMin, c),
  },
  {
    test: (_f, l) =>
      /\bnotice period\b|\bwhen can you start\b|\bearliest (possible )?start\b|\bavailab(le|ility) to start\b/.test(
        l,
      ),
    value: (c, f) => (f.type === 'date' ? undefined : noticeAnswer(f, c)),
  },
  {
    test: (f) => TOTAL_YEARS.test(f.label.trim()),
    value: (c, f) =>
      c.totalYears == null
        ? undefined
        : f.type === 'number'
          ? String(c.totalYears)
          : `${c.totalYears} years`,
  },
  {
    test: (_f, l) => /\blinkedin\b/.test(l),
    value: (c) => link(c.links.linkedin),
  },
  { test: (_f, l) => /\bgithub\b/.test(l), value: (c) => link(c.links.github) },
  {
    test: (_f, l) =>
      /\bportfolio\b|\bpersonal (web)?site\b|\bwebsite\b/.test(l),
    value: (c) => link(c.links.portfolio),
  },
  {
    test: (_f, l) => /\bwhatsapp\b|\bphone number\b|\bmobile number\b/.test(l),
    value: (c) => c.phone,
  },
  {
    test: (_f, l) =>
      /\bwhat is your country\b|\bcountry of residence\b|\bwhich country\b|^country$/.test(
        l,
      ),
    value: (c) => c.country || undefined,
  },
  {
    test: (_f, l) =>
      /where (do you|are you).*(live|located|based)|current (location|city|area of residency)|area of residency/.test(
        l,
      ),
    value: (c) => c.location || undefined,
  },
  {
    test: (_f, l) =>
      /\b(faculty|university|college)\b/.test(l) && !/\byear\b/.test(l),
    value: (c) => c.educations[0]?.institution || undefined,
  },
  {
    test: (_f, l) => /\bgradu?a?tion year\b|\byear of graduation\b/.test(l),
    value: (c, f) => {
      const y = c.educations[0]?.end?.slice(0, 4);
      return !y ? undefined : f.type === 'date' ? `${y}-06-30` : y;
    },
  },
  {
    test: (_f, l) => /\bcurrent (position|title|role)\b/.test(l),
    value: (c) => c.headline || undefined,
  },
];

// Standard field ids: Lever input names + Workable standard ids.
const BY_ID: Record<string, (c: Candidate) => string | undefined> = {
  name: (c) => c.fullName,
  firstname: (c) => c.firstName,
  lastname: (c) => c.lastName,
  // Greenhouse ids.
  first_name: (c) => c.firstName,
  last_name: (c) => c.lastName,
  email: (c) => c.email,
  phone: (c) => c.phone,
  location: (c) => c.location,
  address: (c) => c.location,
  org: (c) => c.currentCompany,
  headline: (c) => c.headline,
  summary: (c) => c.summary,
  'urls[LinkedIn]': (c) => link(c.links.linkedin),
  'urls[GitHub]': (c) => link(c.links.github),
  'urls[Portfolio]': (c) => link(c.links.portfolio),
  'urls[Other]': (c) => link(c.links.portfolio),
  // Greenhouse's hosted-form education row (see forms/greenhouse.form.ts).
  'school--0': (c) => c.educations[0]?.institution || undefined,
  'degree--0': (c) => c.educations[0]?.degree || undefined,
  'discipline--0': (c) => c.educations[0]?.field || undefined,
};

export interface MappingResult {
  answers: Answers;
  // Required and not answerable from facts: for the drafting agent.
  questions: PendingQuestion[];
}

export function mapAnswers(
  schema: FormSchema,
  candidate: Candidate,
  confirmed: Answers = {},
): MappingResult {
  const answers: Answers = {};
  const questions: PendingQuestion[] = [];

  for (const field of schema.fields) {
    // Files are attached by the submitter; groups are optional and the
    // resume already carries them.
    // ponytail: education/experience groups skipped — add when an employer requires them.
    if (field.type === 'file' || field.type === 'group') continue;

    const label = normalizeLabel(field.label);
    const intake = intakeFor(field.label);
    const fact = intake ? candidate.facts[intake.key] : undefined;
    const hasOptions = field.type === 'choice' || field.type === 'multi';

    const candidates: (AnswerValue | undefined)[] = [
      confirmed[field.id],
      BY_ID[field.id]?.(candidate),
      // The ATS's own field type is language-proof ("Teléfono", "Telefon"…).
      field.type === 'phone'
        ? candidate.phone
        : field.type === 'email'
          ? candidate.email
          : undefined,
      candidate.answerBank[label],
      RESOLVERS.find((r) => r.test(field, label))?.value(candidate, field),
      // An intake fact, expressed as one of this form's own options.
      fact === undefined
        ? undefined
        : hasOptions
          ? matchOption(field.options ?? [], fact)
          : fact,
      // Sensitive and the seeker gave nothing: the form's own decline option.
      intake?.sensitive && hasOptions
        ? declineOption(field.options)
        : undefined,
    ];
    const pick = candidates
      .map((v) => (field.type === 'multi' && typeof v === 'string' ? [v] : v))
      .find((v) => !isEmpty(v) && fits(field, v!));

    if (pick !== undefined) answers[field.id] = pick;
    else if (field.required)
      questions.push({
        ...field,
        sensitive: intake?.sensitive,
        intakeKey: intake?.key,
      });
  }
  return { answers, questions };
}

export function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' ') || parts[0] || '',
  };
}

// Whole years from the first job's start to today.
export function totalYears(
  experiences: { start: string | null }[],
  now = new Date(),
): number | null {
  const starts = experiences
    .map((e) => (e.start ? Date.parse(e.start) : NaN))
    .filter((t) => !Number.isNaN(t));
  if (!starts.length) return null;
  return Math.max(
    0,
    Math.floor((now.getTime() - Math.min(...starts)) / (365.25 * 86_400_000)),
  );
}
