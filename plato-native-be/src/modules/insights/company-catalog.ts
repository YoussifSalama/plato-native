import { boardFromUrl } from '../discovery/adapters/public-boards.adapter';
import { companyMark, normalizeCompany } from '../discovery/company';
import type { JobSource } from '@prisma/client';

// The "to follow" catalogue (FOLLOWING.md 2.1): pure helpers, so the sheet import and the auto-attach are tested
// without a database. CompanyCatalogService does the reads and writes.

export const SOURCE_TYPES = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'smartrecruiters',
  'workday',
  'bamboohr',
  'recruitee',
  'teamtailor',
  'personio',
  'successfactors',
  'oracle_taleo',
  'oracle_hcm',
  'icims',
  'jobvite',
  'breezy',
  'zoho_recruit',
  'bayt',
  'wuzzuf',
  'linkedin',
  'careers_page',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface CatalogSource {
  type: SourceType;
  ref: string; // board slug, or the jobs page URL
  verified: boolean;
  status: 'active' | 'broken' | 'unverified';
  fails?: number;
  last_ok_at?: string | null;
  last_error?: string | null;
}

export interface CatalogEntry {
  company_key: string;
  name: string;
  aliases: string[];
  countries: string[];
  website: string | null;
  sources: CatalogSource[];
}

// --- the sheet ---------------------------------------------------------------------------------------------------

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes. First row is the header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    if (row.some((f) => f.trim())) rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  endRow();
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) =>
    Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])),
  );
}

const list = (s: string | undefined) =>
  (s ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
const site = (s: string | undefined) => {
  const v = (s ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  return v.includes('.') ? v : null;
};

/** Sheet rows (name, aliases, countries, website, source_type, source_ref, verified) -> one entry per company. */
export function entriesFromSheet(
  rows: Record<string, string>[],
): CatalogEntry[] {
  const by = new Map<string, CatalogEntry>();
  for (const r of rows) {
    const c = normalizeCompany(r.name);
    if (!c.key) continue;
    const e = by.get(c.key) ?? {
      company_key: c.key,
      name: r.name.trim(),
      aliases: [],
      countries: [],
      website: null,
      sources: [],
    };
    e.aliases = [...new Set([...e.aliases, ...list(r.aliases)])];
    e.countries = [
      ...new Set([
        ...e.countries,
        ...list(r.countries).map((x) => x.toUpperCase()),
      ]),
    ];
    e.website ??= site(r.website);
    const type = (r.source_type ?? '').trim().toLowerCase() as SourceType;
    const ref = (r.source_ref ?? '').trim();
    if (SOURCE_TYPES.includes(type) && ref) {
      const verified = /^(yes|true|1)$/i.test(r.verified ?? '');
      e.sources = mergeSources(e.sources, [
        { type, ref, verified, status: verified ? 'active' : 'unverified' },
      ]);
    }
    by.set(c.key, e);
  }
  return [...by.values()];
}

const sourceKey = (s: Pick<CatalogSource, 'type' | 'ref'>) =>
  `${s.type}|${s.ref.trim().replace(/\/+$/, '').toLowerCase()}`;

/** Existing sources keep their crawl state; new ones are added once; a verified incoming source marks an old one verified. */
export function mergeSources(
  existing: CatalogSource[],
  incoming: CatalogSource[],
): CatalogSource[] {
  const out = [...existing];
  for (const s of incoming) {
    const i = out.findIndex((o) => sourceKey(o) === sourceKey(s));
    if (i < 0) out.push(s);
    else if (s.verified && !out[i].verified)
      out[i] = {
        ...out[i],
        verified: true,
        status: out[i].status === 'broken' ? 'broken' : 'active',
      };
  }
  return out;
}

// --- auto-attach: job boards our searches already found --------------------------------------------------------

export interface IndexedJob {
  source: JobSource;
  url: string;
  apply_url: string | null;
  company: string;
  company_url?: string | null;
  raw?: unknown;
}

/** A job's board as a catalogue source (Greenhouse, Lever, Ashby, Workable), or null for a job board's own listing. */
export function sourceFromJob(j: IndexedJob): CatalogSource | null {
  if (
    j.source === 'GREENHOUSE' ||
    j.source === 'LEVER' ||
    j.source === 'ASHBY'
  ) {
    const b =
      boardFromUrl(j.source, j.apply_url ?? '') ??
      boardFromUrl(j.source, j.url);
    if (!b) return null;
    // ponytail: Lever's EU instance is noted on the ref; the crawler reads the "eu:" prefix.
    return {
      type: j.source.toLowerCase() as SourceType,
      ref: b.eu ? `eu:${b.slug}` : b.slug,
      verified: false,
      status: 'unverified',
    };
  }
  if (j.source === 'WORKABLE') {
    const m =
      /apply\.workable\.com\/([^/?#]+)/i.exec(j.apply_url ?? '') ??
      /apply\.workable\.com\/([^/?#]+)/i.exec(j.url);
    return m && m[1] !== 'j'
      ? { type: 'workable', ref: m[1], verified: false, status: 'unverified' }
      : null;
  }
  return null;
}

/** Jobs in the index -> catalogue entries for the companies whose boards they show (with the website, for the logo). */
export function entriesFromJobs(jobs: IndexedJob[]): CatalogEntry[] {
  const by = new Map<string, CatalogEntry>();
  for (const j of jobs) {
    const c = normalizeCompany(j.company);
    if (!c.key) continue;
    const src = sourceFromJob(j);
    const domain = companyMark(j).domain;
    if (!src && !domain) continue;
    const e = by.get(c.key) ?? {
      company_key: c.key,
      name: c.name,
      aliases: [],
      countries: [],
      website: null,
      sources: [],
    };
    e.website ??= domain;
    if (src) e.sources = mergeSources(e.sources, [src]);
    by.set(c.key, e);
  }
  return [...by.values()].filter((e) => e.sources.length);
}

// --- how often the crawler visits ---------------------------------------------------------------------------------

/** hot: 10+ followers, or followed and new jobs in the last 7 days (every 6 h); warm: followed (daily); cold: weekly. */
export function tierOf(
  followers: number,
  lastNewJobAt: Date | null,
  now = Date.now(),
): 'hot' | 'warm' | 'cold' {
  if (
    followers >= 10 ||
    (followers > 0 &&
      lastNewJobAt &&
      now - lastNewJobAt.getTime() < 7 * 86_400_000)
  )
    return 'hot';
  return followers > 0 ? 'warm' : 'cold';
}
