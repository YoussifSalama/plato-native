import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentInput, UpdateDocumentInput } from './types';

@Injectable()
export class JobSeekerDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  list(job_seeker_id: string) {
    return this.prisma.jobSeekerDocument.findMany({ where: { job_seeker_id } });
  }

  listByVersion(document_version_id: string) {
    return this.prisma.jobSeekerDocument.findMany({
      where: { document_version_id },
    });
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
