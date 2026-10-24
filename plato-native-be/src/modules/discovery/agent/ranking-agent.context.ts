import { JobSeekerService } from '../../user/job-seeker.service';
import { DiscoveryService } from '../discovery.service';

export interface RankingAgentContext {
  userId: string;
  jobSeekerService: JobSeekerService;
  discoveryService: DiscoveryService;
  // When set, job tools only see this conversation's pool.
  threadId?: string;
}

export async function requireJobSeekerId(ctx: RankingAgentContext) {
  const jobSeeker = await ctx.jobSeekerService.getByUserId(ctx.userId);
  if (!jobSeeker)
    throw new Error(`No job seeker profile for user ${ctx.userId}`);
  return jobSeeker.id;
}
