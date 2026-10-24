import { norm } from './text';
import type { FieldInfo, Held, Mapping, Profile, ProfileKey } from './types';

// Deterministic mapping of recognised identity fields to profile values. It
// only acts when the evidence is strong and unambiguous, and says why when it
// does not. It never guesses between two candidates and never decides
// consent, choices or free text: those are left for the person.

export const ACT_THRESHOLD = 0.85;
const AMBIGUITY_GAP = 0.1;

interface Rule {
  autocomplete: string[];
  types?: string[]; // native input types that identify the field on their own
  exact: string[]; // normalised label equals one of these
  phrase?: string[]; // label merely contains one of these: weaker, never enough to act
  not?: RegExp; // label words that rule the key out
}

const ORG = /\b(company|employer|organi[sz]ation|school|university|college|reference|referr?er|manager|supervisor|emergency|spouse|parent|guardian|recruiter|business)\b/;

const RULES: Record<ProfileKey, Rule> = {
  firstName: { autocomplete: ['given-name'], exact: ['first name', 'given name', 'forename', 'first'], not: ORG },
  lastName: { autocomplete: ['family-name'], exact: ['last name', 'surname', 'family name', 'last'], not: ORG },
  fullName: { autocomplete: ['name'], exact: ['full name', 'name', 'your name', 'legal name', 'candidate name', 'applicant name'], phrase: ['full name'], not: ORG },
  email: { autocomplete: ['email'], types: ['email'], exact: ['email', 'email address', 'e mail', 'your email', 'work email', 'personal email'], phrase: ['email'] },
  phone: { autocomplete: ['tel', 'tel-national'], types: ['tel'], exact: ['phone', 'phone number', 'mobile', 'mobile number', 'telephone', 'cell', 'cell phone', 'contact number', 'mobile phone'], phrase: ['phone', 'mobile'] },
  city: { autocomplete: ['address-level2'], exact: ['city', 'town', 'current city', 'city of residence', 'city town'], phrase: ['city'] },
  country: { autocomplete: ['country', 'country-name'], exact: ['country', 'country of residence', 'country region', 'current country'], phrase: ['country'] },
  linkedin: { autocomplete: [], exact: ['linkedin', 'linkedin profile', 'linkedin url', 'linkedin profile url'], phrase: ['linkedin'] },
  github: { autocomplete: [], exact: ['github', 'github profile', 'github url', 'github profile url'], phrase: ['github'] },
  portfolio: { autocomplete: [], exact: ['portfolio', 'website', 'personal website', 'portfolio url', 'personal site', 'portfolio website'], phrase: ['portfolio', 'website'] },
  currentCompany: { autocomplete: ['organization'], exact: ['current company', 'current employer', 'present employer', 'present company'], phrase: [] },
};

// Which controls a key may be written to.
const KINDS: Record<ProfileKey, FieldInfo['kind'][]> = {
  firstName: ['text'], lastName: ['text'], fullName: ['text'], email: ['text', 'email'], phone: ['text', 'tel'],
  city: ['text', 'select'], country: ['select', 'text'], linkedin: ['text', 'url'], github: ['text', 'url'], portfolio: ['text', 'url'], currentCompany: ['text'],
};

const CONFIRM = /\b(confirm|confirmation|repeat|re ?enter|retype|verify|again)\b/;

interface Score {
  key: ProfileKey;
  score: number;
  why: string;
}

function scoreField(f: FieldInfo): Score[] {
  const label = norm(f.label);
  const out: Score[] = [];
  for (const key of Object.keys(RULES) as ProfileKey[]) {
    const r = RULES[key];
    if (!KINDS[key].includes(f.kind)) continue;
    if (r.not?.test(label)) continue;
    let score = 0;
    let why = '';
    const set = (s: number, w: string) => s > score && ((score = s), (why = w));
    if (f.autocomplete && r.autocomplete.includes(f.autocomplete)) set(0.98, `autocomplete=${f.autocomplete}`);
    if (r.types?.includes(f.type)) set(0.9, `type=${f.type}`);
    // "Confirm email" is still an email field; the label rule below handles it.
    const bare = label.replace(CONFIRM, '').replace(/\s+/g, ' ').trim();
    const strongSource = f.labelSource !== 'placeholder' && f.labelSource !== 'name' && f.labelSource !== 'title';
    if (r.exact.includes(label) || r.exact.includes(bare)) set(strongSource ? 0.95 : 0.6, `label "${f.label}"`);
    else if (r.phrase?.some((p) => new RegExp(`\\b${p}\\b`).test(label))) set(strongSource ? 0.8 : 0.5, `label mentions ${key}`);
    if (score > 0) out.push({ key, score, why });
  }
  return out.sort((a, b) => b.score - a.score);
}

function optionFor(f: FieldInfo, wanted: string) {
  const w = norm(wanted);
  const opts = (f.options ?? []).filter((o) => !o.disabled && !o.placeholder);
  const hits = opts.filter((o) => norm(o.label) === w || norm(o.value) === w);
  return hits.length === 1 ? hits[0]!.value : null; // none, or two the same: not a safe pick
}

function proposalFor(f: FieldInfo, best: Score, profile: Profile): Mapping | undefined {
  const value = profile[best.key]?.trim();
  if (!value || f.hasValue) return undefined;
  const v = f.kind === 'select' ? optionFor(f, value) : value;
  return v === null ? undefined : { fieldId: f.id, key: best.key, value: v, confidence: best.score, why: best.why };
}

export interface MapResult {
  mappings: Mapping[];
  held: Held[];
}

/**
 * `fields` is one inspection. Fields already seen in an earlier round are the
 * caller's to filter out; everything passed here is evaluated.
 */
export function mapFields(fields: FieldInfo[], profile: Profile): MapResult {
  const mappings: Mapping[] = [];
  const held: Held[] = [];
  const claimed = new Map<ProfileKey, { f: FieldInfo; score: Score; confirm: boolean }[]>();

  for (const f of fields) {
    // Checkboxes, radio questions and tick lists are never keyword-mapped: the AI decides them from the profile
    // and the box's own wording (a required consent to apply is ticked; marketing never is).
    if (f.kind === 'checkbox') {
      held.push({ fieldId: f.id, reason: 'unmapped' });
      continue;
    }
    if (f.duplicateLabelWith?.length) {
      held.push({ fieldId: f.id, reason: 'duplicate-label' });
      continue;
    }
    const scores = scoreField(f);
    const best = scores[0];
    if (!best) {
      held.push({ fieldId: f.id, reason: 'unmapped' });
      continue;
    }
    const second = scores[1];
    if (second && second.score >= 0.5 && best.score - second.score < AMBIGUITY_GAP) {
      held.push({ fieldId: f.id, reason: 'ambiguous', candidates: [best.key, second.key] });
      continue;
    }
    if (best.score < ACT_THRESHOLD) {
      // One weak candidate: offer it, so the person can choose Use. Default stays Skip.
      held.push({ fieldId: f.id, reason: 'low-confidence', candidates: [best.key], proposal: proposalFor(f, best, profile) });
      continue;
    }
    claimed.set(best.key, [...(claimed.get(best.key) ?? []), { f, score: best, confirm: CONFIRM.test(norm(f.label)) }]);
  }

  for (const [key, list] of claimed) {
    // One field per key, or one primary plus its "confirm" twin. Anything else is a guess.
    const primaries = list.filter((c) => !c.confirm);
    const okay = list.length === 1 || (primaries.length === 1 && key === 'email');
    if (!okay) {
      for (const c of list) held.push({ fieldId: c.f.id, reason: 'duplicate-key', candidates: [key] });
      continue;
    }
    const value = profile[key]?.trim();
    for (const c of list) {
      if (!value) held.push({ fieldId: c.f.id, reason: 'no-profile-value', candidates: [key] });
      else if (c.f.hasValue) held.push({ fieldId: c.f.id, reason: 'already-filled', candidates: [key] });
      else if (c.f.kind === 'select') {
        const opt = optionFor(c.f, value);
        if (opt === null) held.push({ fieldId: c.f.id, reason: 'no-matching-option', candidates: [key] });
        else mappings.push({ fieldId: c.f.id, key, value: opt, confidence: c.score.score, why: c.score.why });
      } else mappings.push({ fieldId: c.f.id, key, value, confidence: c.score.score, why: c.score.why });
    }
  }
  return { mappings, held };
}
