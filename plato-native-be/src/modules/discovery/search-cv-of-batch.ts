import type { PrismaService } from '../prisma/prisma.service';

// Kept apart from search-cv.service.ts: the extension imports it, and must not load the storage client.
/** The CV an apply batch's search ran with, when it picked one: applications from that search send it. */
export async function searchCvOfBatch(
  prisma: PrismaService,
  jobSeekerId: string,
  batchId: string,
) {
  const batch = await prisma.applyBatch.findUnique({
    where: { id: batchId },
    select: { search_id: true },
  });
  if (!batch?.search_id) return null;
  const run = await prisma.discoveryRun.findUnique({
    where: { id: batch.search_id },
    select: { query: true },
  });
  const cvId = (run?.query as { cvId?: string } | null)?.cvId;
  return cvId
    ? prisma.searchCv.findFirst({
        where: { id: cvId, job_seeker_id: jobSeekerId },
      })
    : null;
}
