const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const GENERIC_AUTH_ERROR = 'Something went wrong. Check your details and try again.';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

/** `?a=1&b=2`, skipping empty values. */
export function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Nest errors: `{ statusCode, message, code? }`; `message` may be an array (validation). */
function messageOf(body: unknown, fallback: string): { message: string; code?: string } {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; code?: unknown };
    const m = Array.isArray(b.message)
      ? b.message.map((x) => (typeof x === 'string' ? x : (x as { message?: string })?.message ?? '')).filter(Boolean).join(', ')
      : typeof b.message === 'string'
        ? b.message
        : '';
    return { message: m || fallback, code: typeof b.code === 'string' ? b.code : undefined };
  }
  return { message: fallback };
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path + qs(opts.query), {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      credentials: 'include',
      headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const { message, code } = messageOf(body, res.statusText || `Request failed (${res.status})`);
    if (res.status === 401 && path !== '/admin/auth/me' && !path.startsWith('/admin/auth/'))
      window.dispatchEvent(new Event('admin:unauthorized'));
    throw new ApiError(res.status, message, code);
  }
  return body as T;
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong.';
