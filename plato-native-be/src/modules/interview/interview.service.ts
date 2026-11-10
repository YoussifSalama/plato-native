import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { IEnvParams } from '../../types/config/env.types';
import { profileBrief } from '../career/career-voice';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeProfileService } from '../resume/resume-profile.service';
import {
  coachFor,
  Ctx,
  current,
  defaultLength,
  FOCUSES,
  followUpFor,
  FORMATS,
  generateQuestions,
  MAX_ANSWER,
  MIN_ANSWER_WORDS,
  ROUNDS,
  scorecardFor,
  Setup,
  setupOf,
  STYLES,
  tooShort,
  Turn,
} from './interview';

// Cost guard on new sessions (resuming one is free).
const STARTS_PER_DAY = 10;
// A pasted post has to be a real post, and is capped so one paste cannot run up the bill.
export const MIN_PASTE_WORDS = 30;
export const MAX_PASTE_CHARS = 12000;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const startSchema = z
  .object({
    // Repeat an earlier session with the same questions.
    retryOf: z.string().min(1).max(40).optional(),
    jobId: z.string().min(1).max(40).optional(),
    paste: z
      .object({
        title: z.string().trim().min(1).max(200),
        company: z.string().trim().max(200).optional(),
        description: z
          .string()
          .trim()
          .max(
            MAX_PASTE_CHARS,
            `The job post is too long (${MAX_PASTE_CHARS} characters at most).`,
          )
          .refine(
            (d) => words(d) >= MIN_PASTE_WORDS,
            `Paste the whole job post (at least ${MIN_PASTE_WORDS} words).`,
          ),
      })
      .optional(),
    general: z
      .object({
        role: z.string().trim().min(2).max(120),
        skill: z.string().trim().min(1).max(80).optional(),
        // What the seeker is preparing for, in their words (level, team, topics, a job ad…).
        notes: z.string().trim().max(2000).optional(),
      })
      .optional(),
    format: z.enum(FORMATS).optional(),
    focus: z.enum(FOCUSES).optional(), // general only
    round: z.enum(ROUNDS).optional(), // job / paste only
    style: z.enum(STYLES).optional(),
    length: z.union([z.literal(3), z.literal(5), z.literal(6)]).optional(),
  })
  .refine(
    (b) =>
      [b.jobId, b.paste, b.general, b.retryOf].filter((x) => x !== undefined)
        .length === 1,
    'Send exactly one of jobId, paste, general or retryOf',
  );
export const answerSchema = z.object({
  answer: z.string().trim().min(1).max(MAX_ANSWER),
});

type Row = Prisma.MockInterviewGetPayload<object>;

const ctxOf = (r: Row, turns: Turn[]): Ctx => ({
  title: r.job_title,
  company: r.company,
  description: r.job_description,
  setup: setupOf(r.setup, turns.length),
});

// What history and the run page show about how a session was set up.
const setupView = (s: Setup) => ({
  target: s.target,
  style: s.style,
  format: s.format,
  round: s.round,
  focus: s.focus,
  role: s.role,
  skill: s.skill,
});

@Injectable()
export class InterviewService {
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ResumeProfileService,
    config: ConfigService,
  ) {
    this.model = config.get<IEnvParams>('env')!.careerModel;
  }

  private async seekerId(userId: string) {
    const s = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!s) throw new NotFoundException('Job seeker profile not found');
    return s.id;
  }

  private async owned(userId: string, id: string) {
    const row = await this.prisma.mockInterview.findFirst({
      where: { id, job_seeker_id: await this.seekerId(userId) },
    });
    if (!row) throw new NotFoundException('Interview not found');
    return row;
  }

  // Never sends the scorecard-less future: the client sees only what it needs.
  private view(r: Row) {
    const turns = r.turns as unknown as Turn[];
    return {
      id: r.id,
      jobTitle: r.job_title,
      company: r.company,
      ...setupView(setupOf(r.setup, turns.length)),
      retryOfId: r.retry_of_id,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      score: r.score,
      scorecard: r.scorecard,
      total: turns.length,
      next: current(turns),
      turns: r.completed_at
        ? turns
        : turns.filter((t) => t.answer !== undefined),
    };
  }

  async start(userId: string, req: z.infer<typeof startSchema>) {
    const seekerId = await this.seekerId(userId);
    const style = req.style ?? 'real';
    const format = req.format ?? 'standard';
    // Starting the same job again continues its unfinished interview when it was set up
    // the same way (style, format, round): no duplicate rows, no second set of questions
    // to pay for, and it doesn't count against the daily limit. Anything else is new.
    if (req.jobId) {
      const round = req.round ?? 'manager';
      const open = await this.prisma.mockInterview.findMany({
        where: { job_seeker_id: seekerId, job_id: req.jobId, completed_at: null },
        orderBy: { created_at: 'desc' },
        take: 20,
      });
      const same = open.find((r) => {
        const s = setupOf(r.setup);
        return (
          s.target === 'job' &&
          s.style === style &&
          s.format === format &&
          s.round === round
        );
      });
      if (same) return this.view(same);
    }
    const today = await this.prisma.mockInterview.count({
      where: {
        job_seeker_id: seekerId,
        created_at: { gt: new Date(Date.now() - 864e5) },
      },
    });
    if (today >= STARTS_PER_DAY)
      throw new HttpException('Daily mock interview limit reached.', 429);

    let base: {
      job_id: string | null;
      job_title: string;
      company: string;
      job_description: string;
      turns: Turn[];
      setup: Setup;
      retry_of_id?: string;
    };
    if (req.retryOf) {
      const prev = await this.owned(userId, req.retryOf);
      const prevTurns = prev.turns as unknown as Turn[];
      const was = setupOf(prev.setup, prevTurns.length);
      base = {
        job_id: prev.job_id,
        job_title: prev.job_title,
        company: prev.company,
        job_description: prev.job_description,
        // Same questions, clean slate; the style may change (try it with coaching).
        turns: prevTurns.map((t) => ({ kind: t.kind, question: t.question })),
        setup: { ...was, style: req.style ?? was.style },
        retry_of_id: prev.id,
      };
    } else {
      const target = req.jobId ? 'job' : req.paste ? 'paste' : 'general';
      const setup: Setup = {
        target,
        style,
        format,
        round: target === 'general' ? null : (req.round ?? 'manager'),
        focus: target === 'general' ? (req.focus ?? 'mixed') : null,
        role: req.general?.role ?? null,
        skill: req.general?.skill ?? null,
        length: req.length ?? defaultLength(style, target),
      };
      let subject: { id: string | null; title: string; company: string; description: string };
      if (req.jobId) {
        const job = await this.prisma.job.findUnique({
          where: { id: req.jobId },
          select: { id: true, title: true, company: true, description: true },
        });
        if (!job) throw new NotFoundException('Job not found');
        if (!job.description?.trim())
          throw new BadRequestException(
            'This job has no description to build an interview from.',
          );
        subject = { ...job, description: job.description ?? '' };
      } else if (req.paste)
        subject = {
          id: null,
          title: req.paste.title,
          company: req.paste.company ?? '',
          description: req.paste.description,
        };
      else
        subject = {
          id: null,
          title: req.general!.role,
          company: '',
          description: req.general!.notes ?? '',
        };
      const brief = profileBrief(await this.profiles.load(seekerId));
      base = {
        job_id: subject.id,
        job_title: subject.title,
        company: subject.company,
        job_description: subject.description,
        setup,
        turns: await generateQuestions(
          this.model,
          {
            title: subject.title,
            company: subject.company,
            description: subject.description,
            setup,
          },
          brief,
        ),
      };
    }
    const row = await this.prisma.mockInterview.create({
      data: {
        ...base,
        turns: base.turns as unknown as Prisma.InputJsonValue,
        setup: base.setup as unknown as Prisma.InputJsonValue,
        job_seeker_id: seekerId,
      },
    });
    return this.view(row);
  }

  async answer(userId: string, id: string, text: string) {
    if (tooShort(text))
      throw new BadRequestException(
        `Answer in a few sentences (at least ${MIN_ANSWER_WORDS} words) so Plato can follow up and score it.`,
      );
    const row = await this.owned(userId, id);
    if (row.completed_at)
      throw new BadRequestException('Interview is finished');
    const turns = row.turns as unknown as Turn[];
    const cur = current(turns);
    if (!cur) throw new BadRequestException('Interview is finished');
    const turn = turns[cur.index];
    const ctx = ctxOf(row, turns);
    if (cur.followUp) turn.followUpAnswer = text;
    else turn.answer = text;
    if (ctx.setup.style === 'coach') {
      // One call: feedback on this answer (and the follow-up answer with it), plus the
      // follow-up decision. Still at most one follow-up per question.
      const c = await coachFor(this.model, ctx, turn, !cur.followUp).catch(
        () => null,
      );
      if (c) {
        turn.feedback = c.feedback;
        if (c.followUp) turn.followUp = c.followUp;
      }
    } else if (!cur.followUp) {
      // One follow-up per question at most.
      const f = await followUpFor(this.model, ctx, turn).catch(() => null);
      if (f) turn.followUp = f;
    }
    const done = !current(turns);
    const card = done ? await scorecardFor(this.model, ctx, turns) : null;
    const saved = await this.prisma.mockInterview.update({
      where: { id },
      data: {
        turns: turns as unknown as Prisma.InputJsonValue,
        ...(card && {
          scorecard: card as unknown as Prisma.InputJsonValue,
          score: card.overall,
          completed_at: new Date(),
        }),
      },
    });
    return this.view(saved);
  }

  async get(userId: string, id: string) {
    return this.view(await this.owned(userId, id));
  }

  // Newest first; scores over time are the progress view.
  async list(userId: string) {
    const rows = await this.prisma.mockInterview.findMany({
      where: { job_seeker_id: await this.seekerId(userId) },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        job_title: true,
        company: true,
        score: true,
        retry_of_id: true,
        setup: true,
        created_at: true,
        completed_at: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      jobTitle: r.job_title,
      company: r.company,
      ...setupView(setupOf(r.setup)),
      score: r.score,
      retryOfId: r.retry_of_id,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  }
}
