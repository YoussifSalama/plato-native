import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  RankingAgentContext,
  requireJobSeekerId,
} from './ranking-agent.context';

const listShortlistedJobsParams = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const listShortlistedJobsTool = tool<
  typeof listShortlistedJobsParams,
  RankingAgentContext
>({
  name: 'list_shortlisted_jobs',
  description:
    "List the current user's shortlisted job matches (already pre-filtered by keyword relevance against their " +
    'skills, experience, and stated preferences), ordered best-match first. Returns compact summaries — use ' +
    'get_job_details for the full description of a specific job.',
  parameters: listShortlistedJobsParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const runIds = ctx.threadId
      ? await ctx.discoveryService.runIdsForThread(jobSeekerId, ctx.threadId)
      : undefined;
    const { items, total } = await ctx.discoveryService.getMatches(
      jobSeekerId,
      {
        take: input.limit ?? 25,
        skip: input.offset ?? 0,
        shortlistedOnly: true,
        filters: { runIds },
      },
    );
    return JSON.stringify({
      total,
      jobs: items.map((m) => ({
        id: m.job.id,
        title: m.job.title,
        company: m.job.company,
        location: m.job.location,
        remote_type: m.job.remote_type,
        job_type: m.job.job_type,
        salary_min: m.job.salary_min,
        salary_max: m.job.salary_max,
        salary_currency: m.job.salary_currency,
        source: m.job.source,
        url: m.job.url,
        match_percent: m.match_percent,
        saved: m.saved,
        application_status: m.application_status,
      })),
    });
  },
});

const getJobDetailsParams = z.object({
  jobId: z.string(),
});

export const getJobDetailsTool = tool<
  typeof getJobDetailsParams,
  RankingAgentContext
>({
  name: 'get_job_details',
  description:
    "Get the full description for one of the current user's shortlisted jobs, by job id.",
  parameters: getJobDetailsParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const job = await ctx.discoveryService.getJobForSeeker(
      jobSeekerId,
      input.jobId,
    );
    if (!job)
      return JSON.stringify({
        error: "Job not found in this user's shortlist",
      });
    return JSON.stringify(job);
  },
});

export const rankingTools = [listShortlistedJobsTool, getJobDetailsTool];
