import { randomUUID } from 'crypto';
import { tokenSummary } from '../credits/estimates';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { run, type AgentInputItem } from '@openai/agents';
import { ChatRole, Prisma } from '@prisma/client';
import { IEnvParams } from '../../types/config/env.types';
import { StorageService } from '../documents/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { profileIssues } from '../resume/resume-checks';
import { ResumeEngine } from '../resume/resume-engine.service';
import { ResumeProfileService } from '../resume/resume-profile.service';
import { stageOf } from '../resume/resume-strategy';
import {
  BuildRequest,
  careerGreeting,
  createCareerAgent,
} from './career.agent';
import { saidBySeeker } from './quote';
import { AttachedDoc, withAttachments } from './attachments';
import { askWhatFor, intentFor, MessageRef, RefJob, refOf, withReference } from './reference';
import { research } from './research.agent';
import { metered } from '../usage/usage';
import { buildJobSeekerSnapshot } from '../discovery/job-seeker-snapshot';
import { describeSeeker } from '../chat/orchestrator.agent';
import { elsewhereMemory } from '../chat/shared-memory';
import { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';

const HISTORY_LIMIT = 30;

// What the seeker sees while a tool runs.
const TOOL_STATUS: Record<string, string> = {
  get_profile: 'Reading your profile',
  research: 'Looking it up on the web',
  build_resume: 'Building your resume',
  save_project: 'Saving that to your profile',
  save_achievement: 'Saving that to your profile',
  confirm_skill: 'Checking and saving that skill',
  set_resume_preferences: 'Saving your preference',
};

type Searched = { query: string; sources: string[] };
// What a message shows under it: a resume file, and/or that Plato looked something up.
type ResearchCard = { type: 'research'; searched: Searched[] };
export type ResumeCard = {
  searched?: Searched[];
  type: 'resume';
  resumeId: string;
  title: string;
  // Why this format, in plain words.
  why: string[];
  // Bytes and template, for the file card in the chat.
  size: number;
  template: string;
  version?: number;
  approved?: boolean;
  edited?: boolean;
  // Keyword coverage against the job, when there was a posting.
  ats?: {
    score: number;
    matched: string[];
    missing: string[];
    headline: string;
    headlineNote: string;
  };
};

@Injectable()
export class CareerService {
  private readonly logger = new Logger(CareerService.name);
  private readonly careerModel: string;
  private readonly searchModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly engine: ResumeEngine,
    private readonly profiles: ResumeProfileService,
    private readonly preferences: JobSeekerPreferenceService,
    config: ConfigService,
  ) {
    const env = config.get<IEnvParams>('env')!;
    this.careerModel = env.careerModel;
    this.searchModel = env.careerSearchModel;
  }

  // Saved preferences + what the other chat has been doing, injected every turn
  // so the seeker is never asked twice. Context only: resume facts still come
  // from the profile and the seeker's own words in this chat.
  private async seekerContext(jobSeekerId: string, fullName: string) {
    const snapshot = await buildJobSeekerSnapshot(
      this.prisma,
      this.preferences,
      jobSeekerId,
    );
    return `\n\n# What Plato already knows (search preferences and saved details; background for conversation only, NOT resume evidence: never put these on a resume unless the profile or the seeker's words in this chat support them)\n${describeSeeker(fullName, snapshot)}${await elsewhereMemory(this.prisma, jobSeekerId, 'career')}`;
  }

  private async seekerFor(userId: string) {
    const seeker = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      include: { user: { select: { full_name: true } } },
    });
    if (!seeker) throw new NotFoundException('Job seeker profile not found');
    return seeker;
  }

  async create(userId: string) {
    const seeker = await this.seekerFor(userId);
    // An untouched thread (opener only) is reused, never duplicated.
    const blank = await this.prisma.careerThread.findFirst({
      where: {
        job_seeker_id: seeker.id,
        messages: { none: { role: ChatRole.USER } },
      },
      orderBy: { created_at: 'desc' },
    });
    if (blank) return this.get(userId, blank.id);
    const thread = await this.prisma.careerThread.create({
      data: {
        job_seeker_id: seeker.id,
        title: 'New conversation',
        messages: {
          create: {
            role: ChatRole.ASSISTANT,
            content: careerGreeting(seeker.user.full_name.split(' ')[0]),
          },
        },
      },
    });
    return this.get(userId, thread.id);
  }

  async list(userId: string) {
    const seeker = await this.seekerFor(userId);
    return this.prisma.careerThread.findMany({
      where: { job_seeker_id: seeker.id },
      orderBy: { updated_at: 'desc' },
      take: 20,
      select: { id: true, title: true, created_at: true, updated_at: true },
    });
  }

  async get(userId: string, threadId: string) {
    const seeker = await this.seekerFor(userId);
    const thread = await this.prisma.careerThread.findFirst({
      where: { id: threadId, job_seeker_id: seeker.id },
      include: { messages: { orderBy: { created_at: 'asc' } } },
    });
    if (!thread) throw new NotFoundException('Conversation not found');
    return thread;
  }

  async send(
    userId: string,
    threadId: string,
    content: string,
    onDelta?: (text: string) => void,
    attachmentIds: string[] = [],
    onStatus?: (text: string) => void,
    reference?: { jobId: string; searchId?: string },
  ) {
    const seeker = await this.seekerFor(userId);
    const thread = await this.prisma.careerThread.findFirst({
      where: { id: threadId, job_seeker_id: seeker.id },
    });
    if (!thread) throw new NotFoundException('Conversation not found');

    // Only the seeker's own, successfully read documents can be attached.
    const attached = attachmentIds.length
      ? await this.prisma.jobSeekerDocument.findMany({
          where: {
            id: { in: attachmentIds },
            job_seeker_id: seeker.id,
            status: 'READY',
          },
          select: { id: true, name: true },
        })
      : [];
    // A pinned job must be one of this seeker's own matches.
    const pinned = reference
      ? await this.prisma.jobSeekerJobMatch.findFirst({
          where: { job_seeker_id: seeker.id, job_id: reference.jobId },
          select: { job: { select: { id: true, title: true, company: true, location: true } } },
        })
      : null;
    const ref: MessageRef | null = pinned
      ? { jobId: pinned.job.id, searchId: reference?.searchId ?? null, title: pinned.job.title, company: pinned.job.company, location: pinned.job.location }
      : null;
    await this.prisma.careerMessage.create({
      data: {
        thread_id: threadId,
        role: ChatRole.USER,
        content,
        ...((attached.length || ref) && {
          ui: {
            type: attached.length ? 'attachment' : 'reference',
            ...(attached.length && { documents: attached }),
            ...(ref && { reference: ref }),
          } as unknown as Prisma.InputJsonValue,
        }),
      },
    });
    // A job pinned to THIS message with no stated intent: ask, in code, before any agent runs (a "hi" or
    // "yes" must never start a resume build). The prompt has the same rule; this makes it certain.
    if (ref && !intentFor(content)) {
      const q = askWhatFor(content, ref);
      onDelta?.(q.reply);
      const message = await this.prisma.careerMessage.create({
        data: { thread_id: threadId, role: ChatRole.ASSISTANT, content: q.reply, ui: { type: 'choices', choices: q.choices } as unknown as Prisma.InputJsonValue },
      });
      await this.prisma.careerThread.update({ where: { id: threadId }, data: { updated_at: new Date() } });
      return { message };
    }
    const history = await this.prisma.careerMessage.findMany({
      where: { thread_id: threadId },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    });
    const docIds = history.flatMap((m) =>
      ((m.ui as { documents?: { id: string }[] } | null)?.documents ?? []).map(
        (d) => d.id,
      ),
    );
    const docs = new Map<string, AttachedDoc>(
      docIds.length
        ? (
            await this.prisma.jobSeekerDocument.findMany({
              where: { id: { in: docIds }, job_seeker_id: seeker.id },
              select: { id: true, name: true, extracted_text: true },
            })
          ).map((d) => [
            d.id,
            { id: d.id, name: d.name, text: d.extracted_text ?? '' },
          ])
        : [],
    );
    const refIds = [...new Set(history.map((m) => refOf(m.ui)?.jobId).filter((x): x is string => !!x))];
    const refJobs = new Map<string, RefJob>(
      refIds.length
        ? (
            await this.prisma.job.findMany({
              where: { id: { in: refIds } },
              select: { id: true, title: true, company: true, location: true, description: true },
            })
          ).map((j) => [j.id, j])
        : [],
    );
    // the job the seeker pinned most recently: the one a mock interview is about
    const latestRef = history.map((m) => refOf(m.ui)).find(Boolean) ?? null;
    const modelText = (m: (typeof history)[number]) =>
      withReference(withAttachments(m.content, m.ui, docs), m.ui, refJobs);
    const input: AgentInputItem[] = history.reverse().map((m) =>
      m.role === ChatRole.USER
        ? { role: 'user' as const, content: modelText(m) }
        : {
            role: 'assistant' as const,
            status: 'completed' as const,
            content: [
              {
                type: 'output_text' as const,
                text:
                  (m.ui as { type?: string } | null)?.type === 'resume'
                    ? `${m.content}\n[You showed the seeker the resume PDF "${(m.ui as ResumeCard).title}"]`
                    : m.content,
              },
            ],
          },
    );

    const userSaid = history
      .filter((m) => m.role === ChatRole.USER)
      .map(modelText);
    const need = (quote: string) => {
      if (!saidBySeeker(userSaid, quote))
        throw new Error(
          'That quote is not in what the seeker wrote. Ask them first, in their own words, and quote it exactly. Do not save anything from a link or from assumptions.',
        );
    };
    let card = null as ResumeCard | null;
    const searched: Searched[] = [];
    let choices: string[] = [];
    const agent = createCareerAgent(
      this.careerModel,
      {
        firstName: seeker.user.full_name.split(' ')[0],
        context: await this.seekerContext(seeker.id, seeker.user.full_name),
      },
      {
        tokens: () => tokenSummary(seeker.user_id),
        profile: async () => {
          const p = await this.profiles.load(seeker.id);
          return {
            ...p,
            stage: stageOf(p.totalYears),
            issues: profileIssues(p),
          };
        },
        saveProject: async (d) =>
          void (await this.profiles.addProject(seeker.id, d)),
        saveAchievement: async (d) =>
          void (await this.profiles.addAchievement(seeker.id, d)),
        confirmSkill: async (d) =>
          void (await this.profiles.upsertSkillEvidence(seeker.id, d)),
        setPreferences: (d) => this.profiles.saveSettings(seeker.id, d),
        research: async (question) => {
          // A few lookups per message is plenty; more is a loop.
          if (searched.length >= 3)
            return {
              found: false,
              error:
                'Enough research for one message. Answer with what you have.',
            };
          try {
            const r = await research(this.searchModel, question);
            searched.push({
              query: question.slice(0, 140),
              sources: r.sources,
            });
            return r;
          } catch (error) {
            this.logger.warn(`Research failed: ${(error as Error).message}`);
            return {
              found: false,
              error:
                'The web lookup failed. Say so and ask the seeker for the details.',
            };
          }
        },
        startMockInterview: (mode) => {
          const j = latestRef && refJobs.get(latestRef.jobId);
          if (!j) return { started: false, error: 'No job is pinned. Ask the seeker to open the job card and press the interview button.' };
          // The UI shows a card that starts the interview the seeker chose (text page or live voice call).
          card = { type: 'interview', mode, job: { id: j.id, title: j.title, company: j.company }, description: (j.description ?? '').slice(0, 6000) } as unknown as ResumeCard;
          return { started: true, mode, job: `${j.title} at ${j.company}` };
        },
        offerChoices: (options) => {
          choices = options
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 4);
        },
        buildResume: async (req) => {
          try {
            const out = await this.build(seeker.id, threadId, req);
            card = out.card;
            return out.reply;
          } catch (error) {
            this.logger.warn(
              `Resume build failed: ${(error as Error).message}`,
            );
            return {
              built: false,
              error: 'Could not build the resume right now.',
            };
          }
        },
      },
    );
    // Always streamed; without onDelta it behaves like a plain run.
    const streamed = await run(agent, input, { stream: true });
    for await (const event of streamed) {
      if (
        event.type === 'raw_model_stream_event' &&
        event.data.type === 'output_text_delta'
      )
        onDelta?.(event.data.delta);
      // Say what the assistant is doing while a tool runs.
      else if (
        event.type === 'run_item_stream_event' &&
        event.item.type === 'tool_call_item'
      ) {
        const name = (event.item.rawItem as { name?: string }).name ?? '';
        const text = TOOL_STATUS[name];
        if (text) onStatus?.(text);
      }
    }
    await streamed.completed;
    const result = metered('career.chat', this.careerModel, streamed);
    const reply =
      typeof result.finalOutput === 'string'
        ? result.finalOutput
        : 'Sorry, I lost my train of thought. Could you say that again?';

    const message = await this.prisma.careerMessage.create({
      data: {
        thread_id: threadId,
        role: ChatRole.ASSISTANT,
        content: reply,
        ...(card || searched.length || choices.length
          ? {
              ui: {
                ...(card ??
                  (searched.length
                    ? { type: 'research' }
                    : { type: 'choices' })),
                ...(searched.length && { searched }),
                ...(choices.length && { choices }),
              } as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
    await this.prisma.careerThread.update({
      where: { id: threadId },
      data: {
        updated_at: new Date(),
        // First real message names the conversation.
        ...(thread.title === 'New conversation' && {
          title: content.slice(0, 60),
        }),
      },
    });
    return { message };
  }

  // Runs the shared resume engine, stores the PDF and the strategy it used.
  private async build(
    jobSeekerId: string,
    threadId: string,
    req: BuildRequest,
  ) {
    const result = await this.engine.build({
      jobSeekerId,
      mode: 'interactive',
      targetRole: req.targetRole,
      jobDescription: req.jobDescription,
      market: req.market ?? undefined,
      template: req.template ?? undefined,
      careerChanger: req.careerChanger,
      // Draft first: gaps are reported with the resume, they never block it.
      ignoreGaps: true,
    });
    if (result.status === 'needs_input')
      return {
        card: null,
        reply:
          result.kind === 'skill_gaps'
            ? {
                built: false,
                needsConfirmation: true,
                gaps: result.gaps,
                note: 'The job requires these and the profile does not show them. Ask the seeker about each, confirm the ones with real proof, then build again with ignoreGaps true.',
              }
            : {
                built: false,
                needsMarketPreference: true,
                market: result.market,
                note: 'Ask once whether to include a personal details block, save it with set_resume_preferences, then build again.',
              },
      };

    const key = `career-resumes/${jobSeekerId}/${randomUUID()}.pdf`;
    await this.storage.putBuffer(key, result.pdf, 'application/pdf');
    const title = `${req.targetRole ?? 'General'} resume`;
    // Versions count up per target role: a rebuild or an edit is a new one.
    const last = await this.prisma.careerResume.aggregate({
      where: { job_seeker_id: jobSeekerId, target_role: req.targetRole },
      _max: { version: true },
    });
    const row = await this.prisma.careerResume.create({
      data: {
        job_seeker_id: jobSeekerId,
        thread_id: threadId,
        title,
        target_role: req.targetRole,
        storage_key: key,
        doc: result.doc as unknown as Prisma.InputJsonValue,
        job_description: req.jobDescription?.slice(0, 8000) ?? null,
        version: (last._max.version ?? 0) + 1,
        strategy: {
          ...result.strategy,
          checks: result.checks,
          ats: result.ats,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      card: {
        type: 'resume',
        resumeId: row.id,
        title,
        why: result.strategy.reasons,
        size: result.pdf.length,
        template: result.strategy.template,
        version: row.version,
        approved: false,
        ...(result.ats && {
          ats: {
            score: result.ats.score,
            matched: result.ats.matched,
            missing: result.ats.missing,
            headline: result.ats.headline.text,
            headlineNote: result.ats.headline.note,
          },
        }),
      } as ResumeCard | null,
      reply: {
        built: true,
        title,
        why: result.strategy.reasons,
        checks: result.checks,
        notOnResume: result.gaps,
        ats: result.ats && {
          score: result.ats.score,
          matched: result.ats.matched,
          missingTerms: result.ats.missing,
          headline: result.ats.headline.text,
          headlineNote: result.ats.headline.note,
        },
      },
    };
  }

  async resumePdf(userId: string, resumeId: string): Promise<Buffer> {
    const seeker = await this.seekerFor(userId);
    const row = await this.prisma.careerResume.findFirst({
      where: { id: resumeId, job_seeker_id: seeker.id },
    });
    if (!row) throw new NotFoundException('Resume not found');
    return this.storage.getObjectBuffer(row.storage_key);
  }
}
