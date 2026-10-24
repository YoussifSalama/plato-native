// One company, one name. Boards write the same employer many ways ("Microsoft",
// "Microsoft Corp.", "MICROSOFT CORPORATION"); the card, the dedupe and the
// logo all need a single spelling and a stable key.

// Legal suffixes, plus words that are usually filler ("Group", "Technologies").
const SUFFIX =
  /[\s,]+(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|s\.a|plc|llp|pty|bv|b\.v|srl|s\.r\.l|pvt|private|holdings?|group|international|intl|technologies|technology|tech)\.?$/i;
// These are part of the brand people say, so the shown name keeps them; only
// the comparison key drops them ("Acme Technologies" and "Acme" are one company).
const BRAND_SUFFIX =
  /^(holdings?|group|international|intl|technologies|technology|tech)$/i;

const stripLegal = (name: string, keepBrandWords: boolean) => {
  let out = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  for (let i = 0; i < 3; i++) {
    const m = SUFFIX.exec(out);
    if (!m) break;
    if (keepBrandWords && BRAND_SUFFIX.test(m[1])) break;
    const next = out.slice(0, m.index).replace(/[\s,.\-–|]+$/, '');
    if (!next) break;
    out = next;
  }
  return out.replace(/[\s,.\-–|]+$/, '');
};

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(
      /(^|[\s\-/&(])([a-z])/g,
      (_, a: string, b: string) => a + b.toUpperCase(),
    );

export interface CompanyName {
  // How to show it.
  name: string;
  // Same company, same key: lowercase letters and digits of the name without legal words.
  key: string;
}

export function normalizeCompany(raw: string | null | undefined): CompanyName {
  const clean = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { name: '', key: '' };
  let name = stripLegal(clean, true) || clean;
  // ALL CAPS or all lower: tidy the case, but leave short acronyms (IBM, SAP).
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (
    letters.length > 4 &&
    (name === name.toUpperCase() || name === name.toLowerCase())
  )
    name = titleCase(name);
  const key = stripLegal(clean, false)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return {
    name,
    key: key || name.toLowerCase().replace(/[^a-z0-9]+/g, ''),
  };
}

// Hosts that are a job board or social site, never the employer's own site:
// a logo from there would show the board's mark, not the company's.
const NOT_EMPLOYER =
  /(^|\.)(linkedin|indeed|glassdoor|ziprecruiter|google|facebook|twitter|x|instagram|youtube|greenhouse|lever|workable|ashbyhq|myworkdayjobs|smartrecruiters|bamboohr|wuzzuf|talent|dice|builtin|handshake|jobbank|jobillico|workdayjobs|recruitee|teamtailor|wellfound|weworkremotely|workingnomads|remoteok|remotive|jobicy|himalayas|bayt|naukrigulf|gulftalent|jooble|adzuna|jobgether|nodesk|dynamitejobs|arc)\./i;

// The employer's own website host, when the posting gave one (for the logo).
export function companyDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(
      /^https?:/i.test(url) ? url : `https://${url}`,
    ).hostname.replace(/^www\./, '');
    return host.includes('.') && !NOT_EMPLOYER.test(`${host}.`) ? host : null;
  } catch {
    return null;
  }
}
