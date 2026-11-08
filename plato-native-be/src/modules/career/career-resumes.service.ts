import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StorageService } from '../documents/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeEngine } from '../resume/resume-engine.service';
import { applyEdits, DocEdits } from '../resume/resume-edit';
import { ResumeDoc, ResumeStrategy } from '../resume/resume.types';
import { ResumeProfileService } from '../resume/resume-profile.service';
import { resolveCountry } from '../discovery/countries';
import type { AtsReport } from '../resume/resume-ats';
import { resumeChanges } from './resume-changes';
import type { ResumeCard } from './career.service';

// Review, edit and approve the resumes built in the Career chat. An edit never
// overwrites: it becomes the next version of the same target role.
@Injectable()
export class CareerResumesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly engine: ResumeEngine,
    private readonly profiles: ResumeProfileService,
  ) {}

  private async owned(userId: string, id: string) {
    const row = await this.prisma.careerResume.findFirst({
      where: { id, job_seeker: { user_id: userId } },
    });
    if (!row) throw new NotFoundException('Resume not found');
    return row;
  }

  private card(
    row: {
      id: string;
      title: string;
      version: number;
      approved: boolean;
      edited: boolean;
    },
    size: number,
    template: string,
  ): ResumeCard {
    return {
      type: 'resume',
      resumeId: row.id,
      title: row.title,
      why: [],
      size,
      template,
      version: row.version,
      approved: row.approved,
      edited: row.edited,
    };
  }

  list(userId: string) {
    return this.prisma.careerResume.findMany({
      where: { job_seeker: { user_id: userId } },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        target_role: true,
        version: true,
        approved: true,
        edited: true,
        created_at: true,
      },
    });
  }

  // The editable document, for the review screen.
  async get(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (!row.doc)
      throw new BadRequestException(
        'This resume was built before editing existed. Ask Plato to build it again.',
      );
    return {
      id: row.id,
      title: row.title,
      version: row.version,
      approved: row.approved,
      edited: row.edited,
      doc: row.doc as unknown as ResumeDoc,
    };
  }

  // Save the seeker's wording as a new version and redraw the PDF.
  async edit(userId: string, id: string, edits: DocEdits) {
    const row = await this.owned(userId, id);
    if (!row.doc) throw new BadRequestException('Nothing to edit here.');
    const strategy = row.strategy as unknown as ResumeStrategy;
    const doc = applyEdits(row.doc as unknown as ResumeDoc, edits);
    const { pdf, checks } = await this.engine.render(doc, strategy);
    const key = `career-resumes/${row.job_seeker_id}/${randomUUID()}.pdf`;
    await this.storage.putBuffer(key, pdf, 'application/pdf');
    const last = await this.prisma.careerResume.aggregate({
      where: { job_seeker_id: row.job_seeker_id, target_role: row.target_role },
      _max: { version: true },
    });
    const saved = await this.prisma.careerResume.create({
      data: {
        job_seeker_id: row.job_seeker_id,
        thread_id: row.thread_id,
        title: row.title,
        target_role: row.target_role,
        storage_key: key,
        strategy: {
          ...strategy,
          checks,
        } as unknown as Prisma.InputJsonValue,
        doc: doc as unknown as Prisma.InputJsonValue,
        job_description: row.job_description,
        version: (last._max.version ?? 0) + 1,
        parent_id: row.id,
        edited: true,
      },
    });
    return { card: this.card(saved, pdf.length, strategy.template), checks };
  }

  // A fresh wording for one part, nothing saved: the seeker decides to keep it.
  async suggest(
    userId: string,
    id: string,
    req: {
      section: 'summary' | 'experience' | 'project';
      index?: number;
      note?: string;
    },
  ) {
    const row = await this.owned(userId, id);
    const doc = await this.engine.suggest({
      jobSeekerId: row.job_seeker_id,
      targetRole: row.target_role,
      jobDescription: row.job_description,
      strategy: row.strategy as unknown as ResumeStrategy,
      note: req.note ?? 'Write it differently, same facts.',
    });
    if (req.section === 'summary') return { summary: doc.summary };
    const list = req.section === 'experience' ? doc.experiences : doc.projects;
    const item = list[req.index ?? -1];
    if (!item) throw new BadRequestException('No such entry.');
    return { bullets: item.bullets };
  }

  // One approved version per target role: the one applications should use.
  async approve(userId: string, id: string) {
    const row = await this.owned(userId, id);
    await this.prisma.$transaction([
      // One approved resume per job when it was made for a job, else one per role
      // (among the role resumes only, so approving one never unapproves a job's).
      this.prisma.careerResume.updateMany({
        where: row.job_id
          ? { job_seeker_id: row.job_seeker_id, job_id: row.job_id }
          : {
              job_seeker_id: row.job_seeker_id,
              target_role: row.target_role,
              OR: [{ job_id: null }, { job_id: { isSet: false } }],
            },
        data: { approved: false },
      }),
      this.prisma.careerResume.update({
        where: { id },
        data: { approved: true },
      }),
    ]);
    return { id, approved: true };
  }

  // Jobs → Tailor & apply (owner screen 07): the resume for one job, built once and
  // kept, so applying to that job later uploads this exact file. `auto` mode never
  // asks; skill gaps come back to the review screen to answer.
  async forJob(
    userId: string,
    jobId: string,
    opts: {
      confirmedSkills?: string[];
      ignoreGaps?: boolean;
      rebuild?: boolean;
    },
  ) {
    const seeker = await this.prisma.jobSeeker.findFirst({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!seeker) throw new NotFoundException('Job seeker profile not found');
    // Only a job Plato found for this seeker.
    const match = await this.prisma.jobSeekerJobMatch.findFirst({
      where: { job_seeker_id: seeker.id, job_id: jobId },
      select: {
        job: {
          select: {
            title: true,
            company: true,
            description: true,
            location: true,
          },
        },
      },
    });
    if (!match) throw new NotFoundException('Job not found');
    const job = match.job;

    const existing = await this.prisma.careerResume.findFirst({
      where: { job_seeker_id: seeker.id, job_id: jobId },
      orderBy: { created_at: 'desc' },
    });
    if (
      existing &&
      !opts.rebuild &&
      !opts.confirmedSkills?.length &&
      !opts.ignoreGaps
    )
      return this.jobView(seeker.id, existing, job);

    const result = await this.engine.build({
      jobSeekerId: seeker.id,
      mode: 'auto',
      targetRole: job.title,
      jobDescription: job.description,
      jobCountry: job.location ? resolveCountry(job.location) : null,
      confirmedSkills: opts.confirmedSkills,
      ignoreGaps: opts.ignoreGaps,
    });
    if (result.status === 'needs_input')
      return {
        status: 'gaps' as const,
        job_id: jobId,
        job: { title: job.title, company: job.company },
        gaps: result.kind === 'skill_gaps' ? result.gaps : [],
      };

    const key = `career-resumes/${seeker.id}/${randomUUID()}.pdf`;
    await this.storage.putBuffer(key, result.pdf, 'application/pdf');
    const row = await this.prisma.careerResume.create({
      data: {
        job_seeker_id: seeker.id,
        job_id: jobId,
        title: `${job.title} · ${job.company}`,
        target_role: job.title,
        storage_key: key,
        doc: result.doc as unknown as Prisma.InputJsonValue,
        job_description: job.description?.slice(0, 8000) ?? null,
        version: (existing?.version ?? 0) + 1,
        parent_id: existing?.id ?? null,
        strategy: {
          ...result.strategy,
          checks: result.checks,
          ats: result.ats,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return this.jobView(seeker.id, row, job);
  }

  private async jobView(
    jobSeekerId: string,
    row: {
      id: string;
      job_id: string | null;
      title: string;
      approved: boolean;
      version: number;
      doc: Prisma.JsonValue;
      strategy: Prisma.JsonValue;
    },
    job: { title: string; company: string },
  ) {
    const profile = await this.profiles.load(jobSeekerId);
    const doc = row.doc as unknown as ResumeDoc | null;
    const ats =
      (row.strategy as { ats?: AtsReport | null } | null)?.ats ?? null;
    return {
      status: 'built' as const,
      id: row.id,
      job_id: row.job_id,
      job: { title: job.title, company: job.company },
      title: row.title,
      approved: row.approved,
      version: row.version,
      changes: doc ? resumeChanges(profile, doc, ats) : [],
    };
  }
}
