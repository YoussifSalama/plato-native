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
  current,
  followUpFor,
  generateQuestions,
  MAX_ANSWER,
  scorecardFor,
  Turn,
} from './interview';

// Cost guard until credits exist (TODO section 8).
const STARTS_PER_DAY = 10;

export const startSchema = z
  .object({
    jobId: z.string().min(1).max(40).optional(),
    // Repeat an earlier session with the same questions.
    retryOf: z.string().min(1).max(40).optional(),
  })
  .refine((b) => !!b.jobId !== !!b.retryOf, 'Send jobId or retryOf');
export const answerSchema = z.object({
  answer: z.string().trim().min(1).max(MAX_ANSWER),
});

type Row = Prisma.MockInterviewGetPayload<object>;

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
      retry_of_id?: string;
    };
    if (req.retryOf) {
      const prev = await this.owned(userId, req.retryOf);
      base = {
        job_id: prev.job_id,
        job_title: prev.job_title,
        company: prev.company,
        job_description: prev.job_description,
        // Same questions, clean slate.
        turns: (prev.turns as unknown as Turn[]).map((t) => ({
          kind: t.kind,
          question: t.question,
        })),
        retry_of_id: prev.id,
      };
    } else {
      const job = await this.prisma.job.findUnique({
        where: { id: req.jobId! },
        select: { id: true, title: true, company: true, description: true },
      });
      if (!job) throw new NotFoundException('Job not found');
      if (!job.description?.trim())
        throw new BadRequestException(
          'This job has no description to build an interview from.',
        );
      const brief = profileBrief(await this.profiles.load(seekerId));
      base = {
        job_id: job.id,
        job_title: job.title,
        company: job.company,
        job_description: job.description,
        turns: await generateQuestions(
          this.model,
          {
            title: job.title,
            company: job.company,
            description: job.description,
          },
          brief,
        ),
      };
    }
    const row = await this.prisma.mockInterview.create({
      data: {
        ...base,
        turns: base.turns as unknown as Prisma.InputJsonValue,
        job_seeker_id: seekerId,
      },
    });
    return this.view(row);
  }

  async answer(userId: string, id: string, text: string) {
    const row = await this.owned(userId, id);
    if (row.completed_at)
      throw new BadRequestException('Interview is finished');
    const turns = row.turns as unknown as Turn[];
    const cur = current(turns);
    if (!cur) throw new BadRequestException('Interview is finished');
    const turn = turns[cur.index];
    if (cur.followUp) turn.followUpAnswer = text;
    else {
      turn.answer = text;
      // One follow-up per question at most.
      const f = await followUpFor(
        this.model,
        { title: row.job_title, company: row.company },
        turn,
      ).catch(() => null);
      if (f) turn.followUp = f;
    }
    const done = !current(turns);
    const card = done
      ? await scorecardFor(
          this.model,
          {
            title: row.job_title,
            company: row.company,
            description: row.job_description,
          },
          turns,
        )
      : null;
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
        created_at: true,
        completed_at: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      jobTitle: r.job_title,
      company: r.company,
      score: r.score,
      retryOfId: r.retry_of_id,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  }
}
