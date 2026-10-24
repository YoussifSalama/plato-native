import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobSeekerInput } from './types';

@Injectable()
export class JobSeekerService {
  constructor(private readonly prisma: PrismaService) {}

  getByUserId(user_id: string, opts: { includeRelations?: boolean } = {}) {
    return this.prisma.jobSeeker.findUnique({
      where: { user_id },
      include: opts.includeRelations
        ? { social_links: true, documents: true, preferences: true }
        : undefined,
    });
  }

  upsertForUser(user_id: string, data: JobSeekerInput) {
    return this.prisma.jobSeeker.upsert({
      where: { user_id },
      create: { user_id, ...data },
      update: data,
    });
  }

  update(user_id: string, data: Partial<JobSeekerInput>) {
    return this.prisma.jobSeeker.update({ where: { user_id }, data });
  }
}
