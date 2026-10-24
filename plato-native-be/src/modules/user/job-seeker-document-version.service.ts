import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JobSeekerDocumentVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A version is a document batch, not an analysis run: reuse the job
   * seeker's current version while it hasn't been analyzed yet, and only
   * start a new one once the current version has an `analyzed_at`.
   */
  async getOrCreateCurrent(job_seeker_id: string) {
    const jobSeeker = await this.prisma.jobSeeker.findUniqueOrThrow({
      where: { id: job_seeker_id },
    });

    if (jobSeeker.current_document_version_id) {
      const current = await this.prisma.jobSeekerDocumentVersion.findUnique({
        where: { id: jobSeeker.current_document_version_id },
      });
      if (current && !current.analyzed_at) return current;
    }

    const latest = await this.prisma.jobSeekerDocumentVersion.findFirst({
      where: { job_seeker_id },
      orderBy: { version_number: 'desc' },
    });

    const created = await this.prisma.jobSeekerDocumentVersion.create({
      data: {
        job_seeker_id,
        version_number: (latest?.version_number ?? 0) + 1,
      },
    });
    await this.prisma.jobSeeker.update({
      where: { id: job_seeker_id },
      data: { current_document_version_id: created.id },
    });
    return created;
  }

  getCurrent(job_seeker_id: string) {
    return this.prisma.jobSeeker
      .findUnique({ where: { id: job_seeker_id } })
      .then((jobSeeker) =>
        jobSeeker?.current_document_version_id
          ? this.prisma.jobSeekerDocumentVersion.findUnique({
              where: { id: jobSeeker.current_document_version_id },
            })
          : null,
      );
  }

  findById(id: string) {
    return this.prisma.jobSeekerDocumentVersion.findUnique({ where: { id } });
  }

  markAnalyzed(id: string) {
    return this.prisma.jobSeekerDocumentVersion.update({
      where: { id },
      data: { analyzed_at: new Date() },
    });
  }

  // Replacements are budgeted per version, across every document in it
  // combined — not per file.
  async incrementReplacementCount(id: string): Promise<number> {
    const version = await this.prisma.jobSeekerDocumentVersion.update({
      where: { id },
      data: { replacement_count: { increment: 1 } },
    });
    return version.replacement_count;
  }
}
