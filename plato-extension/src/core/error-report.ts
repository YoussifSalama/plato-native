// Client error reports for the Plato admin's error log (POST /extension/v1/errors). Best effort only:
// throttled (one message at most once a minute, at most 20 a minute), capped in size, and it never
// throws or reports its own failure. Only what the caller passes goes out: never a screenshot or page HTML.
export interface ClientError {
  message: string;
  code?: string;
  page?: string;
  stack?: string;
  data?: unknown;
}

const MINUTE = 60_000;
const DATA_MAX = 4000; // characters of JSON

const cut = (s: unknown, n: number) => (typeof s === 'string' && s ? s.slice(0, n) : undefined);

function capData(data: unknown): unknown {
  if (data === undefined) return undefined;
  try {
    const json = JSON.stringify(data);
    if (json === undefined) return undefined;
    return json.length <= DATA_MAX ? data : { truncated: json.slice(0, DATA_MAX) };
  } catch {
    return undefined;
  }
}

// A page address without its query or fragment (they can carry tokens).
export function pageOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).slice(0, 300);
  } catch {
    return undefined;
  }
}

export function createErrorReporter(o: { send: (body: ClientError) => Promise<unknown>; now?: () => number; perMinute?: number }) {
  const now = o.now ?? Date.now;
  const perMinute = o.perMinute ?? 20;
  const lastSent = new Map<string, number>();
  let windowStart = -Infinity;
  let count = 0;

  /** Returns whether the report was sent (false when throttled or invalid). Never throws. */
  return function report(e: ClientError): boolean {
    try {
      const message = cut(String(e.message ?? ''), 500) ?? 'Unknown error';
      const t = now();
      if (t - windowStart >= MINUTE) {
        windowStart = t;
        count = 0;
      }
      if (count >= perMinute) return false;
      const last = lastSent.get(message);
      if (last !== undefined && t - last < MINUTE) return false;
      count++;
      lastSent.set(message, t);
      if (lastSent.size > 100) for (const [k, at] of lastSent) if (t - at >= MINUTE) lastSent.delete(k);
      const body: ClientError = { message };
      const code = cut(e.code, 80);
      const page = cut(e.page, 300);
      const stack = cut(e.stack, 4000);
      const data = capData(e.data);
      if (code) body.code = code;
      if (page) body.page = page;
      if (stack) body.stack = stack;
      if (data !== undefined) body.data = data;
      void Promise.resolve()
        .then(() => o.send(body))
        .catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  };
}

/** Message and stack of anything thrown. */
export function describeError(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message || e.name, stack: e.stack };
  try {
    return { message: typeof e === 'string' ? e : JSON.stringify(e) ?? String(e) };
  } catch {
    return { message: String(e) };
  }
}
