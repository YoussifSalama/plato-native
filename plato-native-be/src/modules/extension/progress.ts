// Read-only picture of what the browser extension is doing for a seeker, from the state it already
// records on the server. Used by the web app's progress sidebar and by the Plato AI assistant.
const GROUPS = {
  waiting: ['PENDING'],
  working: ['CLAIMED', 'PREPARING', 'FILLING', 'REVIEW', 'AWAITING_SUBMIT'],
  needsYou: ['NEEDS_USER', 'VERIFY'],
  submitted: ['SUBMITTED_CONFIRMED', 'SUBMITTED_ATTESTED'],
  failed: ['FAILED'],
  skipped: ['SKIPPED'],
} as const;
const ONLINE_MS = 90_000;

export async function extensionProgress(prisma: any, jobSeekerId: string) {
  const items: any[] = await prisma.applyBatchItem.findMany({
    where: { job_seeker_id: jobSeekerId, state: { not: 'CANCELLED' } },
    orderBy: { updated_at: 'desc' },
    take: 200,
  });
  const counts = Object.fromEntries(
    Object.entries(GROUPS).map(([k, states]) => [k, items.filter((i) => (states as readonly string[]).includes(i.state)).length]),
  ) as Record<keyof typeof GROUPS, number>;
  const recent = items.slice(0, 20);
  const jobs: any[] = recent.length
    ? await prisma.job.findMany({ where: { id: { in: recent.map((i) => i.job_id) } }, select: { id: true, title: true, company: true } })
    : [];
  const devices: any[] = await prisma.extensionDevice.findMany({
    where: { job_seeker_id: jobSeekerId, revoked_at: null },
    select: { last_used_at: true },
  });
  const last = Math.max(0, ...devices.map((d) => d.last_used_at?.getTime() ?? 0));
  return {
    // "online" = a linked browser talked to the server in the last 90 s (the extension heartbeats while it works)
    online: Date.now() - last < ONLINE_MS,
    linked: devices.length > 0,
    counts,
    active: counts.working + counts.needsYou,
    recent: recent.map((i) => {
      const j = jobs.find((x) => x.id === i.job_id);
      const d = (i.detail?.last ?? {}) as { message?: string; reason?: string };
      return {
        id: i.id,
        title: j?.title ?? 'Job',
        company: j?.company ?? '',
        state: i.state as string,
        note: d.message ?? d.reason ?? (i.state === 'VERIFY' ? i.detail?.verify_reason : null) ?? null,
        updated_at: i.updated_at,
      };
    }),
  };
}
