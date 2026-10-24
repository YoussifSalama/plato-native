import { tool } from '@openai/agents';
import { z } from 'zod';
import { ProfileAgentContext } from './context';

export const getProfileTool = tool<undefined, ProfileAgentContext>({
  name: 'get_profile',
  description:
    "Get the current user's job seeker profile (bio, avatar, location, website, birth date, social links, documents, preferences).",
  parameters: undefined,
  execute: async (_input, runContext) => {
    const ctx = runContext!.context;
    const profile = await ctx.jobSeekerService.getByUserId(ctx.userId, {
      includeRelations: true,
    });
    return JSON.stringify(profile);
  },
});

const updateProfileParams = z.object({
  bio: z.string().optional(),
  avatar_url: z.string().optional(),
  website: z.string().optional(),
  birth_date: z
    .string()
    .optional()
    .describe('ISO date string, e.g. 1995-06-01'),
});

export const updateProfileTool = tool<
  typeof updateProfileParams,
  ProfileAgentContext
>({
  name: 'update_profile',
  description: "Update the current user's job seeker profile fields.",
  parameters: updateProfileParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    const profile = await ctx.jobSeekerService.upsertForUser(ctx.userId, {
      bio: input.bio,
      avatar_url: input.avatar_url,
      website: input.website,
      ...(input.birth_date && { birth_date: new Date(input.birth_date) }),
    });
    return JSON.stringify(profile);
  },
});
