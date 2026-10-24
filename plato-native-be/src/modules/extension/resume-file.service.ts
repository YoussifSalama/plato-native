import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { basename } from 'node:path';
import { z } from 'zod';
import { resolveCountry } from '../discovery/countries';
import { PrismaService } from '../prisma/prisma.service';
import type { ResumeEngine } from '../resume/resume-engine.service';
import type { StorageService } from '../documents/storage.service';
import { ExtensionBatchService } from './batch.service';
import { ExtensionPrincipal } from './extension.service';

// Which resume goes into this application's upload field: the one on the profile, or one built for
// this job by the resume engine (auto mode: it never asks). Asked once per application; the answer
// lives on the item, so a stopped run carries on without asking again.
export const resumeChoiceSchema = z.object({ choice: z.enum(['profile', 'tailored']) });
export type ResumeChoice = z.infer<typeof resumeChoiceSchema>['choice'];
// The engine by token (a type-only import): its module pulls ESM-only code that breaks specs loading the controllers.
export const RESUME_ENGINE = 'RESUME_ENGINE';
export const DOC_STORAGE = 'DOC_STORAGE'; // same reason: the storage client pulls code that breaks the route specs

@Injectable()
export class ResumeFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batches: ExtensionBatchService,
    @Inject(RESUME_ENGINE) private readonly engine: Pick<ResumeEngine, 'build'>,
    @Inject(DOC_STORAGE) private readonly storage: Pick<StorageService, 'getObjectBuffer'>, // the profile's documents live in object storage
  ) {}

  async choose(p: ExtensionPrincipal, itemId: string, choice: ResumeChoice) {
    const item = await this.batches.assertWorking(p, itemId);
    await this.prisma.applyBatchItem.update({ where: { id: item.id }, data: { resume_choice: choice } });
    return { resume_choice: choice };
  }

  /** The chosen resume as a file (base64 in JSON: the extension hands it to the page's file input). */
  async file(p: ExtensionPrincipal, itemId: string): Promise<{ name: string; mime: string; data: string }> {
    const item = await this.batches.assertWorking(p, itemId);
    const choice = (item.resume_choice as ResumeChoice | null) ?? (item.detail as { resume_choice?: ResumeChoice } | null)?.resume_choice; // older rows kept it in detail
    if (!choice) throw new ConflictException('No resume chosen for this application yet');
    if (choice === 'profile') {
      const doc = await this.prisma.jobSeekerDocument.findFirst({
        where: { job_seeker_id: p.jobSeekerId, type: 'CV_RESUME', status: 'READY' },
        orderBy: { created_at: 'desc' },
      });
      if (!doc) throw new NotFoundException('No resume on the profile');
      const bytes = await this.storage.getObjectBuffer(doc.storage_key);
      const name = doc.name ?? basename(doc.url);
      return { name, mime: /\.docx?$/i.test(name) ? 'application/msword' : 'application/pdf', data: bytes.toString('base64') };
    }
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: item.job_id }, select: { title: true, company: true, description: true, location: true } });
    const built = await this.engine.build({
      jobSeekerId: p.jobSeekerId,
      mode: 'auto',
      targetRole: job.title,
      jobDescription: job.description,
      jobCountry: job.location ? resolveCountry(job.location) : null,
    });
    if (built.status !== 'built') throw new ConflictException(`Could not build a resume for this job (${built.kind})`);
    const safe = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().slice(0, 60);
    return { name: `Resume - ${safe(job.company)} - ${safe(job.title)}.pdf`, mime: 'application/pdf', data: built.pdf.toString('base64') };
  }
}
