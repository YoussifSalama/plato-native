import { pathOfControl } from './page-registry';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { run, type AgentInputItem, type Tool } from '@openai/agents';
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
import {
  CareerService,
  careerNote,
  TOOL_STATUS,
} from '../career/career.service';
import { careerTools } from '../career/career.agent';
import { askWhatFor, intentFor } from '../career/reference';

const HISTORY_LIMIT = 30;

// The agent only sees text, so a card it showed is written into history.
function cardNote(ui: unknown) {
  if (!ui) return '';
  // A career card (resume PDF, interview, lookups, choices) from the career tools.
  if ((ui as { type?: string }).type) return careerNote(ui);
  const ids = ((ui as QuestionCard | null)?.questions ?? []).map((q) => q.id);
  return `\n[You showed the seeker a question card: ${ids.join(', ')}]`;
}

// What the seeker sees while a tool runs (career tools add theirs).
const STATUS: Record<string, string> = {
  ...TOOL_STATUS,
  start_job_search: 'Starting the search',
  get_search_status: 'Checking the search',
  list_shortlisted_jobs: 'Reading your matches',
  get_job_details: 'Reading the job',
  get_application_readiness: 'Checking your application details',
  get_extension_progress: 'Checking the extension',
};

export interface SendOptions {
  // Documents already uploaded by this seeker (a CV to improve).
  attachmentIds?: string[];
  // A job pinned to the message; must be one of the seeker's matches.
  reference?: { jobId: string; searchId?: string };
  // Streaming: text pieces of the reply, and what is being done while a tool runs.
  onDelta?: (text: string) => void;
  onStatus?: (text: string) => void;
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
    private readonly career: CareerService,
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
    opts: SendOptions = {},
  ) {
    const { jobSeeker, snapshot } = await this.seekerFor(userId);
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, job_seeker_id: jobSeeker.id },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    // An auto follow-up is not something the seeker said: not saved, only shown to the model.
    const attached = ui.auto
      ? []
      : await this.career.attachable(jobSeeker.id, opts.attachmentIds);
    const ref = ui.auto
      ? null
      : await this.career.pinnedRef(jobSeeker.id, opts.reference);
    if (!ui.auto) {
      const userUi = CareerService.userUi(attached, ref);
      const firstWords = !(await this.prisma.chatMessage.count({
        where: { thread_id: threadId, role: ChatRole.USER },
      }));
      await this.prisma.chatMessage.create({
        data: {
          thread_id: threadId,
          role: ChatRole.USER,
          content,
          ...(userUi && { ui: userUi }),
        },
      });
      // A conversation started from the panel on another page is named by its
      // first message; a search page keeps its search title.
      if (firstWords && ui.page)
        await this.prisma.chatThread.update({
          where: { id: threadId },
          data: { title: content.slice(0, 60) },
        });
    }
    // A job pinned to THIS message with no stated intent: ask, in code, before any
    // agent runs (a "hi" must never start a resume build). Same rule as the career chat.
    if (ref && !intentFor(content)) {
      const q = askWhatFor(content, ref);
      opts.onDelta?.(q.reply);
      const message = await this.prisma.chatMessage.create({
        data: {
          thread_id: threadId,
          role: ChatRole.ASSISTANT,
          content: q.reply,
          ui: { type: 'choices', choices: q.choices },
        },
      });
      await this.prisma.chatThread.update({
        where: { id: threadId },
        data: { updated_at: new Date() },
      });
      return { message, events: [] as OrchestratorEvent[] };
    }
    const history = await this.prisma.chatMessage.findMany({
      where: { thread_id: threadId },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    });
    // Attached CVs and pinned jobs are read into the messages they came with.
    const known = await this.career.historyContext(jobSeeker.id, history);
    const input: AgentInputItem[] = history.reverse().map((m) =>
      m.role === ChatRole.USER
        ? { role: 'user' as const, content: known.modelText(m) }
        : {
            role: 'assistant' as const,
            status: 'completed' as const,
            content: [
              {
                type: 'output_text' as const,
                text: `${m.content}${cardNote(m.ui)}`,
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
    const kit = this.career.toolkit(jobSeeker, null, known);
    const agent = createOrchestratorAgent(
      model,
      { firstName: jobSeeker.user.full_name, snapshot },
      live,
      await elsewhereMemory(this.prisma, jobSeeker.id, 'search'),
      // Resumes built here have no career thread (this is a chat thread).
      careerTools(kit.deps) as Tool<OrchestratorContext>[],
      // ui.page is only sent by the panel docked outside a search page.
      !!ui.page,
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
    // Always streamed; without onDelta it behaves like a plain run.
    const streamed = await run(agent, input, { context, stream: true });
    for await (const event of streamed) {
      if (
        event.type === 'raw_model_stream_event' &&
        event.data.type === 'output_text_delta'
      )
        opts.onDelta?.(event.data.delta);
      else if (
        event.type === 'run_item_stream_event' &&
        event.item.type === 'tool_call_item'
      ) {
        const name = (event.item.rawItem as { name?: string }).name ?? '';
        if (STATUS[name]) opts.onStatus?.(STATUS[name]);
      }
    }
    await streamed.completed;
    // Read after the run: starting a search renames the thread.
    const named = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      select: { title: true },
    });
    const result = metered(
      'chat.orchestrator',
      model,
      streamed,
      named?.title ? { thread: named.title } : undefined,
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
        // A question card wins; otherwise what the career tools made (resume, choices…).
        ...(context.card
          ? { ui: context.card as unknown as Prisma.InputJsonValue }
          : kit.replyUi()
            ? { ui: kit.replyUi() }
            : {}),
      },
    });
    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { updated_at: new Date() },
    });
    return { message: saved, events };
  }
}
