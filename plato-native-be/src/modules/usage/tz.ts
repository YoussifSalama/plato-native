// The admin panel's calendar: days start at midnight in the business's time zone (Cairo by
// default, ADMIN_TZ to change), not UTC, so "today" and every daily chart match the owner's day.
// Egypt has summer time, so the offset is worked out per date, never assumed.

export const ADMIN_TZ = process.env.ADMIN_TZ || 'Africa/Cairo';

const fmt = new Map<string, Intl.DateTimeFormat>();
const formatter = (tz: string) => {
  let f = fmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    fmt.set(tz, f);
  }
  return f;
};

const partsOf = (d: Date, tz: string) => {
  const p = Object.fromEntries(
    formatter(tz)
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    h: +p.hour,
    min: +p.minute,
    s: +p.second,
  };
};

/** "2026-11-28": the calendar day `d` falls on in the time zone. */
export function tzDay(d: Date = new Date(), tz = ADMIN_TZ): string {
  const p = partsOf(d, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Milliseconds the zone is ahead of UTC at instant `d` (+2 h or +3 h in Cairo). */
function offsetMs(d: Date, tz: string) {
  const p = partsOf(d, tz);
  return (
    Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) -
    Math.floor(d.getTime() / 1000) * 1000
  );
}

/** The instant a calendar day ("2026-11-28") starts in the time zone. */
export function dayStart(day: string, tz = ADMIN_TZ): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), tz);
  // the offset at the found instant can differ on a DST change day: settle once more
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

/** "2026-11-28" -> "2026-11-29". */
export const nextDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** Monday of the day's week, as a calendar day. */
export const weekOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
