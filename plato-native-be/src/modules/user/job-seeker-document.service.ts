import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { DocumentInput, UpdateDocumentInput } from './types';

const RETIRED = 'Retired: you deleted your CV';

@Injectable()
export class JobSeekerDocumentService implements OnModuleInit {
  private readonly logger = new Logger(JobSeekerDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // CVs retired before they were erased (or kept by a reference since gone) are
  // erased at boot, in the background (storage calls never hold up the start). Idempotent.
  onModuleInit() {
    void this.purgeRetiredCvs()
      .then((n) => n && this.logger.log(`erased ${n} retired CV(s)`))
      .catch((e: Error) =>
        this.logger.warn(`retired CV sweep failed: ${e.message}`),
      );
  }

  list(job_seeker_id: string) {
    return this.prisma.jobSeekerDocument.findMany({ where: { job_seeker_id } });
  }

  listByVersion(document_version_id: string) {
    return this.prisma.jobSeekerDocument.findMany({
      where: { document_version_id },
    });
  }

  // What the seeker sees and manages: the current batch (its CV and what came
  // with it) plus every supporting document, whichever batch it joined. Older
  // CVs stay out of sight. Only the fields the screens need.
  listLive(job_seeker_id: string, current_version_id: string | null) {
    return this.prisma.jobSeekerDocument.findMany({
      where: {
        job_seeker_id,
        OR: [
          { type: { not: 'CV_RESUME' } },
          ...(current_version_id
            ? [{ document_version_id: current_version_id }]
            : []),
        ],
      },
      select: {
        id: true,
        type: true,
        name: true,
        status: true,
        processing_error: true,
        document_version_id: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  // A deleted CV must never come back: the CVs of earlier batches stop being
  // used at once (apply reads the newest READY CV) and are never listed, then
  // erased by purgeRetiredCvs.
  retireOtherCvs(job_seeker_id: string, keep_version_id: string | null) {
    return this.prisma.jobSeekerDocument.updateMany({
      where: {
        job_seeker_id,
        type: 'CV_RESUME',
        ...(keep_version_id && {
          document_version_id: { not: keep_version_id },
        }),
      },
      data: { status: 'FAILED', processing_error: RETIRED },
    });
  }

  /**
   * Retired CVs are erased for good: the file from storage, then the row (with
   * its text and apply_json cache). Nothing keeps a pointer to an old CV's file:
   * apply, the extension and the v3 brain read the newest READY CV at the moment
   * they upload (no application or batch item stores a CV's id or key), and a
   * chat attachment keeps its own name. A CV something still points at (a skill
   * credential's document_id, or another record holding the same storage key)
   * stays retired and is erased by a later delete or the boot sweep once free.
   * One seeker's, or everyone's (boot). Returns how many were erased.
   */
  async purgeRetiredCvs(job_seeker_id?: string) {
    const retired = await this.prisma.jobSeekerDocument.findMany({
      where: {
        ...(job_seeker_id && { job_seeker_id }),
        type: 'CV_RESUME',
        status: 'FAILED',
        processing_error: RETIRED,
      },
      select: { id: true, storage_key: true },
    });
    let erased = 0;
    for (const d of retired)
      try {
        if (await this.inUse(d)) continue;
        // the file first: a failure leaves the row retired, and the next sweep tries again
        await this.storage.delete(d.storage_key);
        await this.prisma.jobSeekerDocument.delete({ where: { id: d.id } });
        erased++;
      } catch (e) {
        this.logger.warn(
          `retired CV ${d.id} not erased yet: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    return erased;
  }

  private async inUse(d: { id: string; storage_key: string }) {
    const key = d.storage_key;
    const counts = await Promise.all([
      this.prisma.skillCredential.count({ where: { document_id: d.id } }),
      this.prisma.jobSeekerDocument.count({
        where: { storage_key: key, id: { not: d.id } },
      }),
      this.prisma.careerResume.count({ where: { storage_key: key } }),
      this.prisma.jobApplication.count({ where: { resume_key: key } }),
      this.prisma.guest.count({ where: { cv_storage_key: key } }),
    ]);
    return counts.some((n) => n > 0);
  }

  findById(id: string) {
    return this.prisma.jobSeekerDocument.findUnique({ where: { id } });
  }

  add(job_seeker_id: string, data: DocumentInput) {
    return this.prisma.jobSeekerDocument.create({
      data: { job_seeker_id, ...data },
    });
  }

  update(id: string, data: UpdateDocumentInput) {
    return this.prisma.jobSeekerDocument.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.jobSeekerDocument.delete({ where: { id } });
  }
}
