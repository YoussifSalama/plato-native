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
import type { ResumeCard } from './career.service';

// Review, edit and approve the resumes built in the Career chat. An edit never
// overwrites: it becomes the next version of the same target role.
@Injectable()
export class CareerResumesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly engine: ResumeEngine,
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
      this.prisma.careerResume.updateMany({
        where: {
          job_seeker_id: row.job_seeker_id,
          target_role: row.target_role,
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
}
