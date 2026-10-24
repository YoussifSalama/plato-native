import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  jobTypeEnum,
  workModeEnum,
} from '../../../../../common/onboarding-options';
import { ProfileAgentContext, requireJobSeekerId } from './context';

export const getPreferencesTool = tool<undefined, ProfileAgentContext>({
  name: 'get_preferences',
  description: "Get the current user's job search preferences.",
  parameters: undefined,
  execute: async (_input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const preferences = await ctx.jobSeekerPreferenceService.get(jobSeekerId);
    return JSON.stringify(preferences);
  },
});

const updatePreferencesParams = z.object({
  email_notifications: z.boolean().optional(),
  push_notifications: z.boolean().optional(),
  ai_recommendations: z.boolean().optional(),
  roles: z.array(z.string()).optional(),
  preferred_job_types: z.array(jobTypeEnum).optional(),
  preferred_industries: z.array(z.string()).optional(),
  preferred_locations: z.array(z.string()).optional(),
  work_setup: z.array(workModeEnum).optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  salary_currency: z.string().nullable().optional(),
  things_to_avoid: z.string().nullable().optional(),
});

export const updatePreferencesTool = tool<
  typeof updatePreferencesParams,
  ProfileAgentContext
>({
  name: 'update_preferences',
  description: "Update the current user's job search preferences.",
  parameters: updatePreferencesParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const preferences = await ctx.jobSeekerPreferenceService.upsert(
      jobSeekerId,
      input,
    );
    return JSON.stringify(preferences);
  },
});
