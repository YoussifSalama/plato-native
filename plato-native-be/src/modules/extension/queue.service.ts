import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { toMatchPercent } from '../discovery/discovery-run.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { DISCOVERY_MATCHES, type MatchEngine } from './searches.service';

// Narrow the waiting queue before (or while) applying: drop jobs under a match %, from given
// companies, or by id. Only PENDING jobs are touched: a job already open is never pulled away.
export const dropSchema = z
  .object({
    itemIds: z.array(z.string().regex(/^[0-9a-f]{24}$/)).max(200).optional(),
    minMatch: z.number().int().min(1).max(100).optional(),
    companies: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .refine((d) => d.itemIds?.length || d.minMatch || d.companies?.length, 'Say what to drop');
export type DropInput = z.infer<typeof dropSchema>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DISCOVERY_MATCHES) private readonly discovery: MatchEngine,
  ) {}

  /** Waiting jobs with company and match %, newest first. */
  async pending(jobSeekerId: string) {
    const items = await this.prisma.applyBatchItem.findMany({ where: { job_seeker_id: jobSeekerId, state: 'PENDING' }, select: { id: true, job_id: true } });
    const ids = items.map((i) => i.job_id);
    const [jobs, matches, ref] = await Promise.all([
      this.prisma.job.findMany({ where: { id: { in: ids } }, select: { id: true, company: true, title: true } }),
      this.prisma.jobSeekerJobMatch.findMany({ where: { job_seeker_id: jobSeekerId, job_id: { in: ids } }, select: { job_id: true, match_score: true } }),
      this.discovery.referenceScore(jobSeekerId),
    ]);
    return items.map((i) => ({
      id: i.id,
      company: jobs.find((j) => j.id === i.job_id)?.company ?? '',
      title: jobs.find((j) => j.id === i.job_id)?.title ?? '',
      match: toMatchPercent(matches.find((m) => m.job_id === i.job_id)?.match_score, ref),
    }));
  }

  async drop(jobSeekerId: string, d: DropInput) {
    const skip = (d.companies ?? []).map(norm);
    const drop = (await this.pending(jobSeekerId)).filter(
      (i) =>
        d.itemIds?.includes(i.id) ||
        (d.minMatch !== undefined && i.match < d.minMatch) ||
        (skip.length && skip.some((c) => norm(i.company).includes(c))),
    );
    const r = drop.length
      ? await this.prisma.applyBatchItem.updateMany({ where: { id: { in: drop.map((i) => i.id) }, job_seeker_id: jobSeekerId, state: 'PENDING' }, data: { state: 'CANCELLED', lease_expires_at: null } })
      : { count: 0 };
    return { dropped: r.count, companies: [...new Set(drop.map((i) => i.company))].slice(0, 10) };
  }
}
