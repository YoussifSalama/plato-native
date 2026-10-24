import { tool } from '@openai/agents';
import { z } from 'zod';
import { ProfileAgentContext, requireJobSeekerId } from './context';

export const listSocialLinksTool = tool<undefined, ProfileAgentContext>({
  name: 'list_social_links',
  description: "List the current user's job seeker social links.",
  parameters: undefined,
  execute: async (_input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const links = await ctx.jobSeekerSocialLinkService.list(jobSeekerId);
    return JSON.stringify(links);
  },
});

const addSocialLinkParams = z.object({
  platform: z.string(),
  url: z.string(),
});

export const addSocialLinkTool = tool<
  typeof addSocialLinkParams,
  ProfileAgentContext
>({
  name: 'add_social_link',
  description: "Add a social link to the current user's job seeker profile.",
  parameters: addSocialLinkParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const link = await ctx.jobSeekerSocialLinkService.add(jobSeekerId, input);
    return JSON.stringify(link);
  },
});

const updateSocialLinkParams = z.object({
  id: z.string(),
  platform: z.string().optional(),
  url: z.string().optional(),
});

export const updateSocialLinkTool = tool<
  typeof updateSocialLinkParams,
  ProfileAgentContext
>({
  name: 'update_social_link',
  description:
    "Update one of the current user's job seeker social links by its id.",
  parameters: updateSocialLinkParams,
  execute: async (input, runContext) => {
    const { id, ...data } = input;
    const link = await runContext!.context.jobSeekerSocialLinkService.update(
      id,
      data,
    );
    return JSON.stringify(link);
  },
});

const removeSocialLinkParams = z.object({ id: z.string() });

export const removeSocialLinkTool = tool<
  typeof removeSocialLinkParams,
  ProfileAgentContext
>({
  name: 'remove_social_link',
  description:
    "Remove a social link from the current user's job seeker profile by its id.",
  parameters: removeSocialLinkParams,
  execute: async (input, runContext) => {
    await runContext!.context.jobSeekerSocialLinkService.remove(input.id);
    return JSON.stringify({ removed: input.id });
  },
});
