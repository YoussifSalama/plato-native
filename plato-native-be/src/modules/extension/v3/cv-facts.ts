// The seeker's CV as JSON: the first source the v3 brain fills a form from (owner, 2026-11-23). The profile kept
// only city + country, so a street address or postal code the CV states never reached the model and it asked.
//
// Made once per uploaded CV (cached on the document row, `apply_json`), from the text the upload already extracted:
// one structured-output call, copy-only. Hallucination guards: the instructions forbid inferring; the schema has no
// room for prose; and grounded() drops every contact value (email, phone, address, postal code, name) that is not in
// the CV text itself. Tokens: empty fields stripped, long entries capped, and the result sits in the cached system
// prompt, so every later turn of the application reads it at the cache price.

export const CV_JSON_VERSION = 2; // bump when the schema or the instructions change: cached copies are rebuilt
export const CV_MAX_CHARS = 12_000; // ~3k tokens in the prompt

// No nullable fields: the API refuses a schema with more than 16 union-typed parameters (2026-11-23, 24 of them failed
// every CV). An empty string means "the CV does not say"; compactCv() drops it.
const str = { type: 'string' };
const strs = { type: 'array', items: { type: 'string' } };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (properties: Record<string, unknown>) => ({ type: 'array', items: obj(properties) });

export const CV_SCHEMA = obj({
  contact: obj({ full_name: str, emails: strs, phones: strs, address_line: str, city: str, state: str, postal_code: str, country: str, links: strs }),
  headline: str,
  summary: str,
  experience: list({ title: str, company: str, location: str, start: str, end: str, details: strs }),
  education: list({ degree: str, field: str, institution: str, location: str, start: str, end: str, grade: str }),
  skills: strs,
  languages: list({ language: str, level: str }),
  certifications: strs,
  other: list({ section: str, text: str }), // anything that fits no field (projects, awards, volunteering), verbatim
});

export const CV_PROMPT = `You turn the text extracted from a resume into JSON that matches the schema.
- Copy facts exactly as written: names, dates, numbers, addresses, phone numbers, emails and links character for character.
- Never infer, complete, translate, correct or guess. A field the text does not state is an empty string "" (a list: []). A city alone is not an address line; no postal code unless one is written.
- The text came from a PDF: columns may be interleaved. Put each fact under the section it belongs to.
- details: the bullet points of that job, each as written. other: anything that fits no field, with its section title, verbatim.`;

export interface CvJson {
  contact?: { full_name?: string | null; emails?: string[]; phones?: string[]; address_line?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null; links?: string[] };
  experience?: { details?: string[] }[];
  other?: unknown[];
  [k: string]: unknown;
}

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const digits = (s: string) => s.replace(/\D/g, '');

/** Drops every contact value the CV text does not contain: the model may only copy, never make one up. */
export function grounded(cv: CvJson, source: string): CvJson {
  const text = flat(source);
  const nums = digits(source);
  const inText = (v?: string | null) => (v && text.includes(flat(v)) ? v : null);
  const word = (v: string) => new RegExp(`(^|[^0-9a-z])${flat(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^0-9a-z])`).test(text);
  const c = cv.contact;
  if (!c) return cv;
  return {
    ...cv,
    contact: {
      ...c,
      full_name: inText(c.full_name),
      emails: (c.emails ?? []).filter((e) => text.includes(flat(e))),
      phones: (c.phones ?? []).filter((p) => digits(p).length >= 7 && nums.includes(digits(p))),
      address_line: inText(c.address_line),
      postal_code: c.postal_code && word(c.postal_code) ? c.postal_code : null, // its own word: "00000" inside a phone number is not one
    },
  };
}

/** Compact JSON for the prompt: no nulls or empty lists, capped at `max` characters by trimming the longest parts. */
export function compactCv(cv: CvJson, max = CV_MAX_CHARS): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const a = v.map(strip).filter((x) => x !== undefined);
      return a.length ? a : undefined;
    }
    if (v && typeof v === 'object') {
      const e = Object.entries(v).map(([k, x]) => [k, strip(x)] as const).filter(([, x]) => x !== undefined);
      return e.length ? Object.fromEntries(e) : undefined;
    }
    return v === null || v === '' ? undefined : v;
  };
  let out = (strip(cv) ?? {}) as CvJson;
  let json = JSON.stringify(out);
  // ponytail: two trims (job bullets, then the "other" sections); a CV still over the cap after both is sent cut
  if (json.length > max) {
    out = { ...out, experience: out.experience?.map((e) => ({ ...e, details: e.details?.slice(0, 4).map((d) => d.slice(0, 300)) })) };
    json = JSON.stringify(out);
  }
  if (json.length > max) json = JSON.stringify({ ...out, other: undefined });
  return json.slice(0, max);
}
