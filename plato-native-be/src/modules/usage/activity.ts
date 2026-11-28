import { z } from 'zod';

// Page activity from the seeker web app: which pages, how often, how long. Only the route's shape
// is kept ("/applications/:id"): no ids, no query string, nothing that was on the page.

export const HEARTBEAT_SECONDS = 60;

const ID_SEGMENT =
  /^(?:[a-f0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{20,})$/i;

/** "/applications/6650…?tab=x" -> "/applications/:id". Null when it isn't an app path. */
export function pageShape(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.split(/[?#]/)[0].trim();
  if (!path.startsWith('/') || path.length > 300) return null;
  const parts = path
    .split('/')
    .filter(Boolean)
    .slice(0, 6)
    .map((p) =>
      ID_SEGMENT.test(p)
        ? ':id'
        : p
            .toLowerCase()
            .replace(/[^a-z0-9._:-]/g, '')
            .slice(0, 40),
    )
    .filter(Boolean);
  return `/${parts.join('/')}`;
}

/** One beat: a page view (when the page opened) and/or seconds spent on it since the last beat. */
export const activitySchema = z.object({
  page: z.string().max(300),
  view: z.boolean().optional(),
  seconds: z
    .number()
    .int()
    .min(0)
    .max(HEARTBEAT_SECONDS * 2)
    .optional(),
});

// the admin panel's calendar day (tz.ts), so a seeker's evening lands on the owner's same day
export { tzDay as activityDay } from './tz';
