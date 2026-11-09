import { PrismaService } from '../prisma/prisma.service';

// Why a job fits, in the seeker's own words: their skills and target roles that the
// posting mentions, title first. The same terms the BM25 ranking scores on, so the
// line explains the number. No AI.
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchReasons(
  job: { title: string; description?: string | null },
  terms: string[],
  max = 3,
): string[] {
  const title = job.title.toLowerCase();
  const body = (job.description ?? '').toLowerCase();
  const has = (text: string, t: string) =>
    new RegExp(`(^|[^a-z0-9])${escape(t.toLowerCase())}($|[^a-z0-9])`).test(
      text,
    );
  const seen = new Set<string>();
  const unique = terms
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 1 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()),
    );
  return [
    ...unique.filter((t) => has(title, t)),
    ...unique.filter((t) => !has(title, t) && has(body, t)),
  ].slice(0, max);
}

// The seeker's terms for matchReasons: target roles first, then skills.
export async function seekerTerms(prisma: PrismaService, jobSeekerId: string) {
  const [seeker, prefs] = await Promise.all([
    prisma.jobSeeker.findUnique({
      where: { id: jobSeekerId },
      select: { skills: true },
    }),
    prisma.jobSeekerPreference.findUnique({
      where: { job_seeker_id: jobSeekerId },
      select: { roles: true },
    }),
  ]);
  return [...(prefs?.roles ?? []), ...(seeker?.skills ?? [])];
}

// BM25 scores are unbounded: a match's percent is relative to this score, the seeker's
// 90th percentile, so one outlier doesn't make everything else look weak.
export async function seekerReferenceScore(
  prisma: PrismaService,
  jobSeekerId: string,
): Promise<number | null> {
  const rows = await prisma.jobSeekerJobMatch.findMany({
    where: {
      job_seeker_id: jobSeekerId,
      shortlisted: true,
      match_score: { gt: 0 },
    },
    select: { match_score: true },
    orderBy: { match_score: 'desc' },
    take: 5000,
  });
  if (!rows.length) return null;
  const idx = Math.floor(rows.length * 0.1);
  return rows[Math.min(idx, rows.length - 1)].match_score;
}
