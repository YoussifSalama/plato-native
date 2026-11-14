import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { IEnvParams } from '../../types/config/env.types';
import { normalizeCompany } from '../discovery/company';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AttemptResult,
  CreateQuiz,
  QuizSummary,
  Section,
} from './quiz.contract';
import {
  planFormat,
  summarize,
  understandJob,
  writeSection,
  type JobBrief,
} from './quiz-ai';
import {
  buildSection,
  pickLibrary,
  roleFamily,
  toDetail,
  toSummary,
} from './quiz-build';
import { fallbackSummary, scoreAttempt, type StoredKey } from './quiz-scoring';

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const createSchema = z.union([
  z.object({ jobId: z.string().regex(OBJECT_ID) }),
  z.object({
    description: z.string().trim().min(80).max(20_000),
    company: z.string().trim().max(120).nullish(),
    role: z.string().trim().max(160).nullish(),
  }),
]);

const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('single_choice'), choice: z.string().max(40) }),
  z.object({
    type: z.literal('multi_choice'),
    choices: z.array(z.string().max(40)).max(20),
  }),
  z.object({
    type: z.literal('rating'),
    value: z.number().int().min(1).max(5),
  }),
  z.object({
    type: z.literal('ranking'),
    order: z.array(z.string().max(40)).max(20),
  }),
  z.object({
    type: z.literal('work_style'),
    side: z.enum(['left', 'right']),
    strength: z.enum(['most', 'more']),
  }),
  z.object({ type: z.literal('pattern'), choice: z.string().max(40) }),
]);
export const submitSchema = z.object({
  answers: z.record(z.string().max(40), answerSchema),
  seconds: z
    .number()
    .int()
    .min(0)
    .max(6 * 3600),
});

// Quiz Builder: practice tests in a company's own format for one role (quiz.contract.ts). Generation runs in the
// background after POST returns, like a job search; the web app polls GET /quizzes/:id. The AI calls run inside the
// request's context, so they are metered to the seeker (tokens). A quiz another seeker already built for the same
// company and role (the library) is reused instead: instant and nearly free.
// ponytail: in-process background work; a restart mid-generation leaves the quiz "generating" -> listed as failed after 10 min.
@Injectable()
export class QuizzesService {
  private readonly logger = new Logger(QuizzesService.name);
  private readonly model: string;
  private readonly searchModel: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const env = config.get<IEnvParams>('env')!;
    this.model = process.env.QUIZ_MODEL ?? env.careerModel;
    this.searchModel = env.careerSearchModel;
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
    if (!OBJECT_ID.test(id)) throw new NotFoundException('Quiz not found');
    const q = await this.prisma.quiz.findFirst({
      where: { id, job_seeker_id: await this.seekerId(userId) },
    });
    if (!q) throw new NotFoundException('Quiz not found');
    return this.expireStuck(q);
  }

  // A generation the server dropped (restart) would spin forever: after 10 minutes it is failed.
  private expireStuck<
    T extends { id: string; status: string; updated_at: Date },
  >(q: T): T {
    if (
      q.status === 'generating' &&
      Date.now() - q.updated_at.getTime() > 10 * 60_000
    ) {
      void this.prisma.quiz
        .update({
          where: { id: q.id },
          data: {
            status: 'failed',
            error: 'The build was interrupted. Try again.',
          },
        })
        .catch(() => undefined);
      return { ...q, status: 'failed' };
    }
    return q;
  }

  private async stats(quizIds: string[]) {
    const rows = quizIds.length
      ? await this.prisma.quizAttempt.groupBy({
          by: ['quiz_id'],
          where: { quiz_id: { in: quizIds } },
          _max: { score: true },
          _count: { _all: true },
        })
      : [];
    // The newest attempt per quiz, for the card's Results button.
    const latest = quizIds.length
      ? await this.prisma.quizAttempt.findMany({
          where: { quiz_id: { in: quizIds } },
          select: { id: true, quiz_id: true },
          orderBy: { created_at: 'desc' },
        })
      : [];
    const last = new Map<string, string>();
    for (const a of latest) if (!last.has(a.quiz_id)) last.set(a.quiz_id, a.id);
    return new Map(
      rows.map((r) => [
        r.quiz_id,
        {
          best: r._max.score ?? null,
          attempts: r._count._all,
          lastAttemptId: last.get(r.quiz_id) ?? null,
        },
      ]),
    );
  }

  async list(userId: string): Promise<QuizSummary[]> {
    const rows = await this.prisma.quiz.findMany({
      where: { job_seeker_id: await this.seekerId(userId) },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    const stats = await this.stats(rows.map((r) => r.id));
    return rows.map((r) => toSummary(this.expireStuck(r), stats.get(r.id)));
  }

  async get(userId: string, id: string) {
    const q = await this.owned(userId, id);
    const history = await this.prisma.quizAttempt.findMany({
      where: { quiz_id: q.id },
      select: { id: true, score: true, seconds: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return {
      ...toDetail(q, (await this.stats([q.id])).get(q.id)),
      history: history.map((a) => ({
        id: a.id,
        score: a.score,
        seconds: a.seconds,
        createdAt: a.created_at.toISOString(),
      })),
    };
  }

  async remove(userId: string, id: string) {
    const q = await this.owned(userId, id);
    await this.prisma.quizAttempt.deleteMany({ where: { quiz_id: q.id } });
    await this.prisma.quiz.delete({ where: { id: q.id } });
    return { ok: true as const };
  }

  // ---- building ------------------------------------------------------------------------------------------------

  async create(userId: string, input: CreateQuiz): Promise<QuizSummary> {
    const seeker = await this.seekerId(userId);
    let job: {
      title: string | null;
      company: string | null;
      description: string;
    };
    let source: Prisma.InputJsonValue;
    if ('jobId' in input) {
      const j = await this.prisma.job.findUnique({
        where: { id: input.jobId },
        select: { id: true, title: true, company: true, description: true },
      });
      if (!j) throw new NotFoundException('Job not found');
      if ((j.description ?? '').trim().length < 80)
        throw new BadRequestException(
          'This job has too little description to build a quiz from. Paste the full posting instead.',
        );
      job = {
        title: j.title,
        company: j.company,
        description: j.description ?? '',
      };
      source = { kind: 'job', job_id: j.id };
    } else {
      job = {
        title: input.role ?? null,
        company: input.company ?? null,
        description: input.description,
      };
      source = { kind: 'text', text: input.description.slice(0, 20_000) };
    }
    // One card per quiz: the same job (or the same pasted text) opens the card the seeker already has. A retake is a
    // new attempt inside it, never a new card; nothing is generated or charged again.
    const norm = (t?: string) =>
      (t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const want = source as { kind: string; job_id?: string; text?: string };
    const existing = (
      await this.prisma.quiz.findMany({
        where: { job_seeker_id: seeker },
        orderBy: { created_at: 'desc' },
        take: 200,
      })
    ).find((q) => {
      const s = q.source as { kind?: string; job_id?: string; text?: string };
      if (this.expireStuck(q).status === 'failed') return false;
      return want.kind === 'job'
        ? s?.kind === 'job' && s.job_id === want.job_id
        : s?.kind === 'text' && norm(s.text) === norm(want.text);
    });
    if (existing)
      return toSummary(
        this.expireStuck(existing),
        (await this.stats([existing.id])).get(existing.id),
      );

    const role = job.title?.trim() || 'Your quiz';
    const quiz = await this.prisma.quiz.create({
      data: {
        job_seeker_id: seeker,
        title: [job.company, role].filter(Boolean).join(' · '),
        company: job.company,
        role,
        role_family: roleFamily(role),
        source,
        stage: 'reading',
      },
    });
    // In the background, inside this request's context (the AI calls are metered to this seeker).
    void this.generate(quiz.id, job).catch((e: unknown) =>
      this.fail(quiz.id, e),
    );
    return toSummary(quiz);
  }

  private async fail(id: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    this.logger.warn(`quiz ${id} failed: ${msg}`);
    await this.prisma.quiz
      .update({
        where: { id },
        data: {
          status: 'failed',
          stage: null,
          error: 'Plato could not build this quiz. Try again in a moment.',
        },
      })
      .catch(() => undefined);
  }

  private stage = (id: string, stage: 'reading' | 'researching' | 'writing') =>
    this.prisma.quiz.update({ where: { id }, data: { stage } });

  async generate(
    id: string,
    input: {
      title: string | null;
      company: string | null;
      description: string;
    },
  ) {
    const brief: JobBrief = await understandJob(this.model, input);
    const company = input.company?.trim() || brief.company?.trim() || null;
    const role = brief.role.trim() || input.title || 'Practice quiz';
    const family = roleFamily(brief.roleFamily || role);
    const companyKey = company ? normalizeCompany(company).key : '';
    await this.prisma.quiz.update({
      where: { id },
      data: {
        title: [company, role].filter(Boolean).join(' · '),
        company,
        company_key: companyKey || null,
        role,
        role_family: family,
      },
    });

    // The library first: the same company and role family, built in the last 60 days.
    const candidates = await this.prisma.quizLibrary.findMany({
      where: { company_key: companyKey, role_family: family },
      orderBy: { created_at: 'desc' },
      take: 5,
    });
    const hit = pickLibrary(candidates, companyKey, family);
    if (hit) {
      await this.prisma.quizLibrary.update({
        where: { id: hit.id },
        data: { times_taken: { increment: 1 } },
      });
      await this.prisma.quiz.update({
        where: { id },
        data: {
          status: 'ready',
          stage: null,
          about: hit.about,
          sources: hit.sources ?? [],
          sections: hit.sections ?? [],
          keys: hit.keys ?? {},
          library_id: hit.id,
        },
      });
      return;
    }

    await this.stage(id, 'researching');
    const plan = await planFormat(this.model, this.searchModel, {
      ...brief,
      company,
      role,
    });
    await this.stage(id, 'writing');
    const written = await Promise.all(
      plan.sections.map((p, i) =>
        writeSection(this.model, { ...brief, company, role }, p, plan.about)
          .then((draft) => buildSection(i, p, draft))
          .catch((e: unknown) => {
            this.logger.warn(
              `quiz ${id} section ${p.kind} failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            return null;
          }),
      ),
    );
    const built = written.filter((s): s is NonNullable<typeof s> => !!s);
    if (!built.length) throw new Error('every section came back empty');
    // Ids are per position (s1, s2...): renumber when a section was dropped, so they stay in order.
    const sections: Section[] = [];
    const keys: Record<string, StoredKey> = {};
    built.forEach((b, i) => {
      const from = b.section.id;
      const to = `s${i + 1}`;
      const re = (s: string) =>
        s.startsWith(`${from}-`) ? `${to}-${s.slice(from.length + 1)}` : s;
      sections.push({
        ...b.section,
        id: to,
        scenarios: b.section.scenarios.map((sc) => ({ ...sc, id: re(sc.id) })),
        questions: b.section.questions.map((q) => ({
          ...q,
          id: re(q.id),
          ...(q.scenarioId && { scenarioId: re(q.scenarioId) }),
        })),
      });
      for (const [qid, k] of Object.entries(b.keys)) keys[re(qid)] = k;
    });

    const library = await this.prisma.quizLibrary.create({
      data: {
        company_key: companyKey,
        company,
        role_family: family,
        role,
        title: [company, role].filter(Boolean).join(' · '),
        about: plan.about,
        sources: plan.sources,
        sections: sections as unknown as Prisma.InputJsonValue,
        keys: keys as unknown as Prisma.InputJsonValue,
        times_taken: 1,
      },
    });
    await this.prisma.quiz.update({
      where: { id },
      data: {
        status: 'ready',
        stage: null,
        about: plan.about,
        sources: plan.sources,
        sections: sections as unknown as Prisma.InputJsonValue,
        keys: keys as unknown as Prisma.InputJsonValue,
        library_id: library.id,
      },
    });
  }

  // ---- the shared library ---------------------------------------------------------------------------------------

  async library(q: string | undefined): Promise<QuizSummary[]> {
    const term = (q ?? '').trim();
    const rows = await this.prisma.quizLibrary.findMany({
      where: term
        ? {
            OR: [
              { company: { contains: term, mode: 'insensitive' } },
              { role: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: [{ times_taken: 'desc' }, { created_at: 'desc' }],
      take: 30,
    });
    return rows.map((r) =>
      toSummary(
        { ...r, status: 'ready', stage: null },
        { best: null, attempts: 0 },
        true,
      ),
    );
  }

  /** A library quiz copied into the seeker's own list: instant, no AI (no tokens). */
  async take(userId: string, libraryId: string): Promise<QuizSummary> {
    if (!OBJECT_ID.test(libraryId))
      throw new NotFoundException('Quiz not found');
    const seeker = await this.seekerId(userId);
    const lib = await this.prisma.quizLibrary.findUnique({
      where: { id: libraryId },
    });
    if (!lib) throw new NotFoundException('Quiz not found');
    await this.prisma.quizLibrary.update({
      where: { id: lib.id },
      data: { times_taken: { increment: 1 } },
    });
    const quiz = await this.prisma.quiz.create({
      data: {
        job_seeker_id: seeker,
        title: lib.title,
        company: lib.company,
        company_key: lib.company_key || null,
        role: lib.role,
        role_family: lib.role_family,
        source: { kind: 'library', library_id: lib.id },
        status: 'ready',
        stage: null,
        about: lib.about,
        sources: lib.sources ?? [],
        sections: lib.sections ?? [],
        keys: lib.keys ?? {},
        library_id: lib.id,
      },
    });
    return toSummary(quiz, undefined, true);
  }

  // ---- attempts ------------------------------------------------------------------------------------------------

  async submit(
    userId: string,
    quizId: string,
    body: z.infer<typeof submitSchema>,
  ): Promise<AttemptResult> {
    const q = await this.owned(userId, quizId);
    if (q.status !== 'ready')
      throw new BadRequestException('This quiz is not ready yet');
    const sections = (q.sections as unknown as Section[]) ?? [];
    const keys = (q.keys as unknown as Record<string, StoredKey>) ?? {};
    const scored = scoreAttempt(sections, keys, body.answers);
    const misses = scored.questions
      .filter((r) => r.score < 0.5)
      .slice(0, 8)
      .map((r) => r.explanation.slice(0, 160));
    const summary = await summarize(this.model, {
      title: q.title,
      score: scored.score,
      sections: scored.sections,
      misses,
    }).catch(() => fallbackSummary(scored));
    const result = { ...scored, summary, seconds: body.seconds };
    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quiz_id: q.id,
        job_seeker_id: q.job_seeker_id,
        answers: body.answers,
        result: result as unknown as Prisma.InputJsonValue,
        score: scored.score,
        seconds: body.seconds,
      },
    });
    return {
      id: attempt.id,
      quizId: q.id,
      ...result,
      createdAt: attempt.created_at.toISOString(),
    };
  }

  async attempt(
    userId: string,
    quizId: string,
    attemptId: string,
  ): Promise<AttemptResult> {
    const q = await this.owned(userId, quizId);
    if (!OBJECT_ID.test(attemptId))
      throw new NotFoundException('Attempt not found');
    const a = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, quiz_id: q.id },
    });
    if (!a) throw new NotFoundException('Attempt not found');
    const r = a.result as unknown as Omit<
      AttemptResult,
      'id' | 'quizId' | 'createdAt'
    >;
    return {
      id: a.id,
      quizId: q.id,
      ...r,
      createdAt: a.created_at.toISOString(),
    };
  }
}
