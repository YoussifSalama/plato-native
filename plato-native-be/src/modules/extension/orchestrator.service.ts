import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { CandidateService } from './candidate.service';
import { QueueService } from './queue.service';
import { ExtensionSettingsService } from './settings';
import { profileSummary } from './profile-summary';
import { ExtensionPrincipal } from './extension.service';

// Everything below the ids is page-derived text: capped hard, and the prompt
// marks it as data. The server trusts none of it for anything but display.
const text = (n: number) => z.string().max(n);
export const orchestratorSchema = z.object({
  message: text(1000).nullable(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: text(1000) }))
    .max(10),
  state: z.object({
    total: z.number().int().min(0).max(50),
    maxTabs: z.number().int().min(1).max(10),
    counts: z.object({
      queued: z.number().int().min(0),
      working: z.number().int().min(0),
      review: z.number().int().min(0),
      submitted: z.number().int().min(0),
      failed: z.number().int().min(0),
      skipped: z.number().int().min(0),
    }),
    blocked: z
      .array(
        z.object({
          id: text(64),
          title: text(120),
          company: text(120),
          blocker: z.enum(['missing_data', 'needs_account', 'captcha', 'login', 'mfa', 'questions', 'submit_failed', 'other']),
          detail: text(200),
          fields: z.array(text(200)).max(12).optional(), // exact labels of the required fields still empty
        }),
      )
      .max(10),
    // every job open on screen, with the truth about its form (so the agent never guesses what is filled)
    jobs: z
      .array(
        z.object({
          id: text(64),
          title: text(120),
          company: text(120),
          status: text(60),
          filled: z.array(text(200)).max(20),
          empty: z.array(text(200)).max(12),
          resume: z.enum(['uploaded', 'missing', 'none']),
          journal: z.array(text(300)).max(12).optional(), // what Plato did on this job, step by step
          choices: z.array(z.object({ label: text(200), options: z.array(text(160)).max(15) })).max(8).optional(), // empty choice questions and their options
        }),
      )
      .max(10)
      .optional(),
  }),
});
export type OrchestratorInput = z.infer<typeof orchestratorSchema>;

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidateService,
    private readonly queue: QueueService,
    private readonly settings: ExtensionSettingsService,
  ) {}

  async turn(p: ExtensionPrincipal, input: OrchestratorInput) {
    const seeker = await this.prisma.jobSeeker.findUnique({
      where: { id: p.jobSeekerId },
      select: { user: { select: { full_name: true } } },
    });
    // ponytail: same env var as the chat agents; ConfigService is ESM-only and breaks the route specs
    // a small model cannot write a good answer: default to mini; ORCHESTRATOR_MODEL overrides (e.g. gpt-4.1)
    const model = process.env.ORCHESTRATOR_MODEL ?? 'gpt-4.1'; // the strong model: it supervises the run and talks to the seeker
    const profile = await this.candidates.load(p.jobSeekerId).then((c) => profileSummary(c), () => '');
    const { blocked, jobs = [], ...rest } = input.state;
    // ponytail: lazy import, the agents SDK is ESM-only and would load in every spec that touches the controllers
    const { runApplyOrchestrator } = await import('../apply/apply-orchestrator.agent');
    return runApplyOrchestrator(
      model,
      {
        ...rest,
        firstName: seeker?.user.full_name.split(' ')[0] ?? 'there',
        profile,
        blocked: blocked.map((b) => `${b.id} | ${b.title} @ ${b.company} | ${b.blocker}: ${b.detail}${b.fields?.length ? ` | fields: ${b.fields.map((f) => `"${f}"`).join('; ')}` : ''}`),
        blockedIds: blocked.map((b) => b.id),
        jobs: jobs.map((j) => `${j.id} | ${j.title} @ ${j.company} | ${j.status} | filled: ${j.filled.map((f) => `"${f}"`).join('; ') || '-'} | empty: ${j.empty.map((f) => `"${f}"`).join('; ') || '-'} | resume: ${j.resume}${j.choices?.length ? `\n    choices still empty: ${j.choices.map((c) => `"${c.label}" options: ${c.options.map((o) => `"${o}"`).join(' | ')}`).join('; ')}` : ''}${j.journal?.length ? `\n    steps so far: ${j.journal.join(' / ')}` : ''}`),
        jobIds: jobs.map((j) => j.id),
        blockedFields: new Map(blocked.map((b) => [b.id, b.fields ?? []])),
      },
      { message: input.message, history: input.history },
      {
        narrowQueue: (d) => this.queue.drop(p.jobSeekerId, d),
        updateSettings: (patch) => this.settings.put(p.jobSeekerId, patch),
      },
    );
  }
}
