import { pathOfControl } from './page-registry';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { run, type AgentInputItem } from '@openai/agents';
import { ChatRole, Prisma } from '@prisma/client';
import { IEnvParams } from '../../types/config/env.types';
import { PrismaService } from '../prisma/prisma.service';
import { JobSeekerService } from '../user/job-seeker.service';
import { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { ApplyService } from '../apply/apply.service';
import { elsewhereMemory } from './shared-memory';
import { buildJobSeekerSnapshot } from '../discovery/job-seeker-snapshot';
import { summarizeRun } from '../discovery/run-status';
import {
  buildGreeting,
  createOrchestratorAgent,
  LiveStatus,
  UiContext,
} from './orchestrator.agent';
import { OrchestratorContext, OrchestratorEvent } from './orchestrator.context';
import type { QuestionCard } from './intake';
import { metered } from '../usage/usage';
import { extensionProgress } from '../extension/progress';
import { CreditsEstimatesService } from '../credits/estimates.service';

const HISTORY_LIMIT = 30;

// The agent only sees text, so a card it showed is written into history.
function cardNote(ui: unknown) {
  const ids = ((ui as QuestionCard | null)?.questions ?? []).map((q) => q.id);
  return `[You showed the seeker a question card: ${ids.join(', ')}]`;
}

@Injectable()
export class ChatThreadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jobSeekerService: JobSeekerService,
    private readonly preferenceService: JobSeekerPreferenceService,
    private readonly discoveryService: DiscoveryService,
    private readonly applyService: ApplyService,
    private readonly estimates: CreditsEstimatesService,
  ) {}

  private async seekerFor(userId: string) {
    const jobSeeker = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      include: { user: { select: { full_name: true } } },
    });
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    const snapshot = await buildJobSeekerSnapshot(
      this.prisma,
      this.preferenceService,
      jobSeeker.id,
    );
    return { jobSeeker, snapshot };
  }

  async create(userId: string) {
    const { jobSeeker, snapshot } = await this.seekerFor(userId);

    // An untouched thread (opener only, no runs) is reused, never duplicated.
    const blank = await this.prisma.chatThread.findFirst({
      where: {
        job_seeker_id: jobSeeker.id,
        messages: { none: { role: ChatRole.USER } },
        discovery_runs: { none: {} },
      },
      orderBy: { created_at: 'desc' },
    });
    if (blank) return this.get(userId, blank.id);

    const thread = await this.prisma.chatThread.create({
      data: {
        job_seeker_id: jobSeeker.id,
        title: snapshot.roles[0] ? `${snapshot.roles[0]} search` : 'New search',
        messages: {
          create: {
            role: ChatRole.ASSISTANT,
            content: buildGreeting(jobSeeker.user.full_name, snapshot),
          },
        },
      },
    });
    return this.get(userId, thread.id);
  }

  async list(userId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    return this.prisma.chatThread.findMany({
      where: { job_seeker_id: jobSeeker.id },
      orderBy: { updated_at: 'desc' },
      take: 20,
      include: {
        discovery_runs: { orderBy: { started_at: 'desc' }, take: 1 },
      },
    });
  }

  async get(userId: string, threadId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, job_seeker_id: jobSeeker.id },
      include: {
        messages: { orderBy: { created_at: 'asc' } },
        discovery_runs: { orderBy: { started_at: 'desc' }, take: 10 },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  async send(
    userId: string,
    threadId: string,
    content: string,
    ui: UiContext = {},
  ) {
    const { jobSeeker, snapshot } = await this.seekerFor(userId);
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, job_seeker_id: jobSeeker.id },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    // An auto follow-up is not something the seeker said: not saved, only shown to the model.
    if (!ui.auto)
      await this.prisma.chatMessage.create({
        data: { thread_id: threadId, role: ChatRole.USER, content },
      });
    const history = await this.prisma.chatMessage.findMany({
      where: { thread_id: threadId },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    });
    const input: AgentInputItem[] = history.reverse().map((m) =>
      m.role === ChatRole.USER
        ? { role: 'user' as const, content: m.content }
        : {
            role: 'assistant' as const,
            status: 'completed' as const,
            content: [
              {
                type: 'output_text' as const,
                text: m.ui ? `${m.content}\n${cardNote(m.ui)}` : m.content,
              },
            ],
          },
    );

    if (ui.auto) input.push({ role: 'user' as const, content });

    // Everything the assistant needs to know about "here": this thread, its
    // latest run, what results exist, and what the client is showing.
    const [latestRun, running, runIds] = await Promise.all([
      this.discoveryService.latestRunForThread(threadId),
      this.discoveryService.runningForSeeker(jobSeeker.id),
      this.discoveryService.runIdsForThread(jobSeeker.id, threadId),
    ]);
    const results = runIds.length
      ? await this.discoveryService.getMatches(jobSeeker.id, {
          take: 5,
          filters: { runIds },
        })
      : null;
    const recent = await this.prisma.chatThread.findMany({
      where: { job_seeker_id: jobSeeker.id },
      orderBy: { updated_at: 'desc' },
      take: 8,
      select: {
        id: true,
        title: true,
        updated_at: true,
        discovery_runs: {
          orderBy: { started_at: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    });
    const live: LiveStatus = {
      thread: { id: thread.id, title: thread.title },
      searches: recent
        .filter((t) => t.discovery_runs.length)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.discovery_runs[0].status,
          when: t.updated_at.toISOString().slice(0, 16).replace('T', ' '),
        })),
      latestRun: latestRun ? summarizeRun(latestRun) : null,
      results: results
        ? {
            total: results.total,
            top: results.items.map((m) => ({
              title: m.job.title,
              company: m.job.company,
              location: m.job.location,
              match_percent: m.match_percent,
              url: m.job.url,
            })),
          }
        : null,
      othersRunning: running
        .filter((r) => r.thread_id !== threadId)
        .map((r) => {
          const s = summarizeRun(r);
          return {
            threadTitle: r.thread?.title ?? 'Another search',
            titles: s.titles,
            elapsedSeconds: s.elapsedSeconds,
          };
        }),
      ui,
    };

    const model = this.configService.get<IEnvParams>('env')!.chatModel;
    const agent = createOrchestratorAgent(
      model,
      { firstName: jobSeeker.user.full_name, snapshot },
      live,
      await elsewhereMemory(this.prisma, jobSeeker.id, 'search'),
    );
    const events: OrchestratorEvent[] = [];
    const context: OrchestratorContext = {
      userId,
      jobSeekerId: jobSeeker.id,
      threadId,
      events,
      jobSeekerService: this.jobSeekerService,
      discoveryService: this.discoveryService,
      applyService: this.applyService,
      extensionProgress: () => extensionProgress(this.prisma, jobSeeker.id),
      tokens: () => this.estimates.summary(userId),
      preferenceService: this.preferenceService,
      snapshot,
    };
    const result = metered(
      'chat.orchestrator',
      model,
      await run(agent, input, { context }),
    );
    // A control named from another page's map is not on this screen: go to its
    // page first (the app then sends the new page and the assistant clicks it).
    const onScreen = new Set(ui.pageMap?.elements.map((e) => e.id) ?? []);
    for (const [i, e] of events.entries()) {
      if (
        (e.type === 'click' || e.type === 'type_text') &&
        !onScreen.has(e.elementId)
      ) {
        const path = pathOfControl(e.elementId);
        if (path) events[i] = { type: 'goto', path, more: true };
      }
    }
    // One page action per turn. A second one would use ids from the page as it was
    // before the first action ran, and hit the wrong control. Multi-step tasks
    // continue in the next turn, on the new page's map.
    // Results-page commands count too: after a goto they would act on the old page.
    const isPageAction = (e: OrchestratorEvent) =>
      [
        'goto',
        'click',
        'type_text',
        'navigate',
        'open_job',
        'apply_filter',
        'remove_filter',
        'propose_apply',
      ].includes(e.type);
    const firstAction = events.findIndex(isPageAction);
    if (firstAction >= 0)
      events.splice(
        0,
        events.length,
        ...events.filter((e, i) => !isPageAction(e) || i === firstAction),
      );
    const reply =
      typeof result.finalOutput === 'string'
        ? result.finalOutput
        : 'Sorry, I lost my train of thought — could you say that again?';

    const saved = await this.prisma.chatMessage.create({
      data: {
        thread_id: threadId,
        role: ChatRole.ASSISTANT,
        content: reply,
        ...(context.card && {
          ui: context.card as unknown as Prisma.InputJsonValue,
        }),
      },
    });
    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { updated_at: new Date() },
    });
    return { message: saved, events };
  }
}
