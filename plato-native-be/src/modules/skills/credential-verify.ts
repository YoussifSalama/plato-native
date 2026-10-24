// Checking a certificate link without trusting it. The seeker pastes a public
// link (Coursera, Credly, Microsoft...); we open it ourselves, on issuers we
// know, and look for their name and the course on the page. This is a link
// check, not the issuer's own confirmation: a page that loads its content with
// JavaScript stays "self-reported".

const ISSUERS: [RegExp, string][] = [
  [/(^|\.)coursera\.org$/, 'Coursera'],
  [/(^|\.)credly\.com$/, 'Credly'],
  [/(^|\.)(learn|credentials)\.microsoft\.com$/, 'Microsoft'],
  [/(^|\.)accredible\.com$/, 'Accredible'],
  [/(^|\.)credential\.net$/, 'Credential.net'],
  [/(^|\.)freecodecamp\.org$/, 'freeCodeCamp'],
  [/(^|\.)scrum\.org$/, 'Scrum.org'],
  [/(^|\.)trailhead\.salesforce\.com$/, 'Salesforce Trailhead'],
  [/(^|\.)skillshop\.withgoogle\.com$/, 'Google Skillshop'],
  [/(^|\.)(academy|certifications)\.hubspot\.com$/, 'HubSpot Academy'],
  [/(^|\.)cp\.certmetrics\.com$/, 'AWS / Pearson VUE'],
];

// Only https, only a known issuer's hostname, no credentials in the URL, no
// IP addresses or odd ports: the server fetches whatever passes this, so it is
// the guard against being pointed at internal addresses.
export function issuerOf(raw: string): { url: URL; issuer: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(':') || !host.includes('.'))
    return null;
  const hit = ISSUERS.find(([re]) => re.test(host));
  return hit ? { url, issuer: hit[1] } : null;
}

const STOP = new Set([
  'professional',
  'certificate',
  'certification',
  'specialization',
  'exam',
  'the',
  'and',
  'for',
  'with',
  'associate',
  'fundamentals',
]);
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length >= 2);

// All of the holder's name parts, and enough of the course's own words.
export function pageMatches(page: string, holderName: string, title: string) {
  const text = page.toLowerCase();
  const name = words(holderName);
  const nameOk = name.length > 0 && name.every((w) => text.includes(w));
  const need = words(title).filter((w) => !STOP.has(w));
  const found = need.filter((w) => text.includes(w)).length;
  const titleOk = need.length === 0 || found >= Math.ceil(need.length / 2);
  return { nameOk, titleOk };
}

const strip = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // keep the content of meta tags: many issuers put the recipient and badge there
    .replace(/<meta[^>]+content="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

export interface Verification {
  status: 'VERIFIED' | 'UNCONFIRMED' | 'INVALID';
  issuer: string | null;
  note: string;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function verifyCredential(
  rawUrl: string,
  holderName: string,
  title: string,
  fetcher: Fetcher = fetch,
): Promise<Verification> {
  const first = issuerOf(rawUrl);
  if (!first)
    return {
      status: 'UNCONFIRMED',
      issuer: null,
      note: 'That link is not from an issuer we can check (Coursera, Credly, Microsoft, Accredible and a few others). It stays self-reported.',
    };
  let current = first.url;
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetcher(current.toString(), {
        redirect: 'manual',
        headers: {
          'user-agent': 'Plato/1.0 (checking a certificate link)',
          accept: 'text/html',
        },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      return {
        status: 'UNCONFIRMED',
        issuer: first.issuer,
        note: 'The issuer did not answer in time. It stays self-reported; try again later.',
      };
    }
    if (res.status >= 300 && res.status < 400) {
      // A redirect must stay on a known issuer.
      const next =
        res.headers.get('location') &&
        issuerOf(new URL(res.headers.get('location')!, current).toString());
      if (!next)
        return {
          status: 'UNCONFIRMED',
          issuer: first.issuer,
          note: 'The link redirects somewhere we do not check. It stays self-reported.',
        };
      current = next.url;
      continue;
    }
    if (res.status === 404 || res.status === 410)
      return {
        status: 'INVALID',
        issuer: first.issuer,
        note: 'The link does not open (not found). Check it and paste the public link again.',
      };
    if (!res.ok)
      return {
        status: 'UNCONFIRMED',
        issuer: first.issuer,
        note: `The issuer's page answered ${res.status}. It stays self-reported.`,
      };
    const page = strip((await res.text()).slice(0, 300_000));
    const { nameOk, titleOk } = pageMatches(page, holderName, title);
    return nameOk && titleOk
      ? {
          status: 'VERIFIED',
          issuer: first.issuer,
          note: `Your name and the course were found on the ${first.issuer} page.`,
        }
      : {
          status: 'UNCONFIRMED',
          issuer: first.issuer,
          note: `The ${first.issuer} page opened, but ${!nameOk ? 'your name' : 'the course name'} was not on it (some issuers load details with JavaScript). It stays self-reported.`,
        };
  }
  return {
    status: 'UNCONFIRMED',
    issuer: first.issuer,
    note: 'Too many redirects. It stays self-reported.',
  };
}
