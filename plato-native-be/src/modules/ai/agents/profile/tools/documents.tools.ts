import { tool } from '@openai/agents';
import { z } from 'zod';
import { JobSeekerDocumentType } from '@prisma/client';
import { ProfileAgentContext, requireJobSeekerId } from './context';

export const listDocumentsTool = tool<undefined, ProfileAgentContext>({
  name: 'list_documents',
  description:
    "List the current user's job seeker documents (CVs, certificates, degrees).",
  parameters: undefined,
  execute: async (_input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const documents = await ctx.jobSeekerDocumentService.list(jobSeekerId);
    return JSON.stringify(documents);
  },
});

const addDocumentParams = z.object({
  type: z.enum(Object.values(JobSeekerDocumentType) as [string, ...string[]]),
  url: z.string(),
  name: z.string().optional(),
});

export const addDocumentTool = tool<
  typeof addDocumentParams,
  ProfileAgentContext
>({
  name: 'add_document',
  description:
    "Add a document (CV, certificate, degree) to the current user's job seeker profile.",
  parameters: addDocumentParams,
  execute: async (input, runContext) => {
    const ctx = runContext!.context;
    const jobSeekerId = await requireJobSeekerId(ctx);
    const version =
      await ctx.jobSeekerDocumentVersionService.getOrCreateCurrent(jobSeekerId);
    const document = await ctx.jobSeekerDocumentService.add(jobSeekerId, {
      type: input.type as JobSeekerDocumentType,
      url: input.url,
      name: input.name,
      storage_key: input.url,
      document_version_id: version.id,
    });
    return JSON.stringify(document);
  },
});

const removeDocumentParams = z.object({ id: z.string() });

export const removeDocumentTool = tool<
  typeof removeDocumentParams,
  ProfileAgentContext
>({
  name: 'remove_document',
  description:
    "Remove a document from the current user's job seeker profile by its id.",
  parameters: removeDocumentParams,
  execute: async (input, runContext) => {
    await runContext!.context.jobSeekerDocumentService.remove(input.id);
    return JSON.stringify({ removed: input.id });
  },
});
