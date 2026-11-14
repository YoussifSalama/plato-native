import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { IEnvParams } from '../../types/config/env.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  catalogue,
  findAssessment,
  itemsOf,
  pooledReasoning,
  scoreAssessment,
  summaryOf,
} from './assessments';
import type {
  AssessmentDetail,
  AssessmentResult,
  CandidateProfile,
  CandidateReport,
  ScaleScore,
} from './quiz.contract';
import { writeReport } from './quiz-ai';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export const submitAssessmentSchema = z.object({
  answers: z.record(
    z.string().max(64),
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('matrix'),
        mask: z.string().regex(/^[01]{20}$/),
      }),
      z.object({
        type: z.literal('likert'),
        value: z.number().int().min(1).max(5),
      }),
    ]),
  ),
  seconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600),
});

type Row = {
  id: string;
  slug: string;
  result: Prisma.JsonValue;
  headline: string;
  seconds: number;
  created_at: Date;
};

// Standard assessments (assessments.ts): attempts, results and the candidate profile + AI report.
@Injectable()
export class AssessmentsService {
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const env = config.get<IEnvParams>('env')!;
    this.model = process.env.QUIZ_MODEL ?? env.careerModel;
  }

  private async seekerId(userId: string) {
    const s = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!s) throw new NotFoundException('Job seeker profile not found');
    return s.id;
  }

  private find(slug: string) {
    const a = findAssessment(slug);
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  /** Every attempt of the seeker, newest first (small: a seeker has tens, not thousands). */
  private rows(seeker: string, slug?: string): Promise<Row[]> {
    return this.prisma.assessmentAttempt.findMany({
      where: { job_seeker_id: seeker, ...(slug && { slug }) },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        slug: true,
        result: true,
        headline: true,
        seconds: true,
        created_at: true,
      },
      take: 500,
    });
  }

  private toResult(r: Row): AssessmentResult {
    return {
      ...(r.result as unknown as Omit<AssessmentResult, 'id' | 'createdAt'>),
      id: r.id,
      createdAt: r.created_at.toISOString(),
    };
  }

  async list(userId: string) {
    const rows = await this.rows(await this.seekerId(userId));
    return catalogue().list.map((a) => {
      const mine = rows.filter((r) => r.slug === a.slug);
      return summaryOf(a, {
        attempts: mine.length,
        lastAttemptId: mine[0]?.id ?? null,
        lastHeadline: mine[0]?.headline ?? null,
        lastAt: mine[0]?.created_at ?? null,
      });
    });
  }

  async get(userId: string, slug: string): Promise<AssessmentDetail> {
    const a = this.find(slug);
    const mine = await this.rows(await this.seekerId(userId), slug);
    const ex = a.matrices ? catalogue().example : null;
    return {
      ...summaryOf(a, {
        attempts: mine.length,
        lastAttemptId: mine[0]?.id ?? null,
        lastHeadline: mine[0]?.headline ?? null,
        lastAt: mine[0]?.created_at ?? null,
      }),
      instructions: a.instructions,
      example: ex ? { cells: ex.cells, answer: ex.cells[8] } : null,
      items: itemsOf(a),
      history: mine.map((r) => ({
        id: r.id,
        headline: r.headline,
        seconds: r.seconds,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  async submit(
    userId: string,
    slug: string,
    input: z.infer<typeof submitAssessmentSchema>,
  ) {
    const a = this.find(slug);
    const seeker = await this.seekerId(userId);
    const result = scoreAssessment(a, input.answers, input.seconds);
    const row = await this.prisma.assessmentAttempt.create({
      data: {
        job_seeker_id: seeker,
        slug,
        answers: input.answers,
        result: result as unknown as Prisma.InputJsonValue,
        headline: result.headline,
        seconds: input.seconds,
      },
    });
    return this.toResult(row);
  }

  async attempt(userId: string, slug: string, id: string) {
    if (!OBJECT_ID.test(id)) throw new NotFoundException('Attempt not found');
    const r = await this.prisma.assessmentAttempt.findFirst({
      where: { id, slug, job_seeker_id: await this.seekerId(userId) },
    });
    if (!r) throw new NotFoundException('Attempt not found');
    return this.toResult(r);
  }

  async profile(userId: string): Promise<CandidateProfile> {
    const seeker = await this.seekerId(userId);
    const rows = await this.rows(seeker);
    const report = await this.prisma.candidateReport.findUnique({
      where: { job_seeker_id: seeker },
    });
    const view = this.view(rows);
    return {
      ...view,
      report: report
        ? {
            ...(report.report as unknown as Omit<CandidateReport, 'createdAt'>),
            createdAt: report.updated_at.toISOString(),
          }
        : null,
      reportStale: !!report && !!rows[0] && report.basis !== rows[0].id,
    };
  }

  /** The profile numbers, from the latest attempt of each assessment (reasoning pooled over every matrix). */
  private view(rows: Row[]) {
    const results = rows.map((r) => this.toResult(r));
    const latest = new Map<string, AssessmentResult>();
    for (const r of results) if (!latest.has(r.slug)) latest.set(r.slug, r);
    const full = latest.get('big-five');
    const quick = latest.get('big-five-quick');
    const big =
      full && quick
        ? full.createdAt >= quick.createdAt
          ? full
          : quick
        : (full ?? quick);
    const highlights: ScaleScore[] = [...latest.values()]
      .filter(
        (r) => r.category !== 'reasoning' && !r.slug.startsWith('big-five'),
      )
      .flatMap((r) => r.scales ?? [])
      .sort((x, y) => Math.abs(y.score - 50) - Math.abs(x.score - 50))
      .slice(0, 6);
    return {
      done: latest.size,
      total: catalogue().list.length,
      reasoning: pooledReasoning(results),
      domains: big?.domains ?? null,
      highlights,
      latest: [...latest.values()].map((r) => ({
        slug: r.slug,
        title: r.title,
        category: r.category,
        headline: r.headline,
        attemptId: r.id,
        createdAt: r.createdAt,
      })),
    };
  }

  /** The AI report: written from the profile numbers and every latest scale score, then kept until asked again. */
  async writeReport(userId: string): Promise<CandidateReport> {
    const seeker = await this.seekerId(userId);
    const rows = await this.rows(seeker);
    if (!rows.length) throw new NotFoundException('Take an assessment first');
    const view = this.view(rows);
    const latest = new Map<string, AssessmentResult>();
    for (const r of rows.map((x) => this.toResult(x)))
      if (!latest.has(r.slug)) latest.set(r.slug, r);
    const draft = await writeReport(this.model, {
      reasoningPercentile: view.reasoning?.percentile ?? null,
      reasoningItemsAnswered: view.reasoning?.items ?? 0,
      inventories: [...latest.values()]
        .filter((r) => r.category !== 'reasoning')
        .map((r) => ({
          title: r.title,
          traits: (r.domains ?? []).map((s) => ({
            name: s.name,
            score: s.score,
          })),
          scales: (r.scales ?? []).map((s) => ({
            name: s.name,
            group: s.group,
            score: s.score,
            highMeans: s.about,
          })),
        })),
    });
    const saved = await this.prisma.candidateReport.upsert({
      where: { job_seeker_id: seeker },
      create: {
        job_seeker_id: seeker,
        basis: rows[0].id,
        report: draft,
      },
      update: {
        basis: rows[0].id,
        report: draft,
      },
    });
    return { ...draft, createdAt: saved.updated_at.toISOString() };
  }
}
