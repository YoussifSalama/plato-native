import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Pure parts of the error log: what is kept of a failed request, and the one
// plain sentence the admin panel shows for why it failed.

export const MAX_DATA_BYTES = 8 * 1024;

// Field names whose values never reach the log, at any depth.
const isSecretKey = (k: string) =>
  /pass|token|secret|authori[sz]ation|cookie|otp|credential/i.test(k) ||
  /(^|[_-])key$/i.test(k) ||
  /[a-z]Key$/.test(k);
// Values that are credentials whatever their field is called.
const SECRET_VALUE = /^(Bearer\s|plx_)/;

/** A copy of `v` with secrets replaced, long strings cut and depth bounded. */
export function redact(v: unknown, depth = 0, extraKeys: string[] = []): unknown {
  if (typeof v === 'string') {
    if (SECRET_VALUE.test(v)) return '[redacted]';
    return v.length > 1000 ? `${v.slice(0, 500)}… (${v.length} chars)` : v;
  }
  if (v === null || typeof v !== 'object') return v;
  if (depth >= 6) return '[deep]';
  if (Array.isArray(v)) {
    const out = v.slice(0, 50).map((x) => redact(x, depth + 1, extraKeys));
    if (v.length > 50) out.push(`… ${v.length - 50} more`);
    return out;
  }
  if (Buffer.isBuffer(v)) return `[${v.length} bytes]`;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>))
    out[k] =
      isSecretKey(k) || extraKeys.includes(k)
        ? '[redacted]'
        : redact(x, depth + 1, extraKeys);
  return out;
}

/** Redacted and at most 8 KB of JSON; bigger is kept as a cut preview. */
export function capData(v: unknown, extraKeys: string[] = []): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  const clean = redact(v, 0, extraKeys);
  let s: string;
  try {
    s = JSON.stringify(clean) ?? 'null';
  } catch {
    return { unserializable: true };
  }
  if (s.length <= MAX_DATA_BYTES) return JSON.parse(s) as Prisma.InputJsonValue;
  return { truncated: true, bytes: s.length, preview: s.slice(0, MAX_DATA_BYTES - 200) };
}

type ResponseBody = { message?: unknown; code?: unknown } | string;

/** The status a response for this exception gets (Nest's default: 500 for anything not an HttpException). */
export const statusOf = (e: unknown) => (e instanceof HttpException ? e.getStatus() : 500);

const issueText = (i: unknown) => {
  if (typeof i === 'string') return i;
  const o = i as { path?: unknown[]; message?: string };
  return o?.message ? `${o.path?.length ? `${o.path.join('.')}: ` : ''}${o.message}` : JSON.stringify(i);
};

/** The message a person reads: Nest's message, zod issues joined, or the error's own. */
export function messageOf(e: unknown): string {
  let m: string;
  if (e instanceof HttpException) {
    const r = e.getResponse() as ResponseBody;
    const msg = typeof r === 'string' ? r : r?.message;
    m = Array.isArray(msg) ? msg.map(issueText).join('; ') : String(msg ?? e.message);
  } else if (e instanceof Error) m = e.message;
  else m = e === undefined ? '' : String(e);
  return m.slice(0, 1000);
}

/** A stable code: the response's own code, a Prisma code, or the error's code. */
export function codeOf(e: unknown): string | undefined {
  if (e instanceof HttpException) {
    const r = e.getResponse() as ResponseBody;
    if (typeof r === 'object' && typeof r?.code === 'string') return r.code;
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code;
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c.slice(0, 60) : undefined;
}

const TIMEOUT = /timeout|timed out|ETIMEDOUT|AbortError|aborted/i;
const UPSTREAM =
  /openai|anthropic|apify|claude|gpt-|upstream|bad gateway|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|overloaded/i;

/** One short sentence on why it happened, from known causes; else the message. */
export function explain(status: number, e: unknown, opts: { routed?: boolean } = {}): string {
  const msg = messageOf(e);
  const code = codeOf(e);
  const name = (e as { name?: string } | null)?.name ?? '';
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return 'A record with the same unique value already exists (duplicate).';
    if (e.code === 'P2025') return 'The record to change or delete was not found (already gone, or the wrong id).';
    if (e.code === 'P2034') return 'Two writes hit the same record at once and the retries ran out (write conflict).';
    return `Database refused the query (Prisma ${e.code}).`;
  }
  if (e instanceof Prisma.PrismaClientValidationError)
    return 'The server built an invalid database query (a bug in the server code).';
  if (TIMEOUT.test(`${name} ${msg} ${code ?? ''}`) || status === 504)
    return 'An operation took too long (an upstream service or the database was too slow).';
  if (status === 502 || (status >= 500 && UPSTREAM.test(`${msg} ${code ?? ''}`)))
    return 'An upstream provider (AI model or job board) failed or refused the call.';
  switch (status) {
    case 400:
      return /: |Expected|Required|Invalid/i.test(msg) && msg !== 'Invalid request'
        ? `The request failed validation: ${msg.slice(0, 200)}`
        : 'The request was malformed or missing required fields.';
    case 401:
      return 'No valid session: signed out, the session expired, or the token was revoked.';
    case 402:
      return 'Not enough Plato tokens for this action.';
    case 403:
      if (code === 'BLOCKED') return 'The account is blocked by an admin.';
      if (code === 'INACTIVE') return 'The admin account is not active yet.';
      if (/origin/i.test(msg)) return 'The request came from an origin that is not allowed.';
      return 'Signed in, but not allowed to do this (missing scope, page or ownership).';
    case 404:
      return opts.routed === false
        ? 'No such route on the API (a wrong URL, or an old client).'
        : 'The item was not found (wrong id, deleted, or not this user’s).';
    case 409:
      return 'Conflicts with the current state (a duplicate, a stale attempt, or already done).';
    case 413:
      return 'The request body was larger than the server accepts.';
    case 429:
      return 'Rate limit hit: too many requests in a short time.';
    case 503:
      return msg || 'A service the request needs is not available right now.';
  }
  if (status >= 500) return `Unexpected server error: ${msg || name || 'no message'}`.slice(0, 300);
  return msg || `HTTP ${status}`;
}

/** extension for /extension/* routes, web when the seeker app named its page, else api. */
export function platformOf(path: string, page?: string): 'web' | 'extension' | 'api' {
  if (path.startsWith('/extension')) return 'extension';
  return page ? 'web' : 'api';
}

/** "CreditsModule" -> "credits", "AdminUsersModule" -> "admin-users". */
export const moduleKey = (className: string) =>
  className
    .replace(/Module$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase() || 'app';
