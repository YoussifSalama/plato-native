import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocialLinkInput } from './types';

@Injectable()
export class JobSeekerSocialLinkService {
  constructor(private readonly prisma: PrismaService) {}

  list(job_seeker_id: string) {
    return this.prisma.jobSeekerSocialLink.findMany({
      where: { job_seeker_id },
    });
  }

  add(job_seeker_id: string, data: SocialLinkInput) {
    return this.prisma.jobSeekerSocialLink.create({
      data: { job_seeker_id, ...data },
    });
  }

  update(id: string, data: Partial<SocialLinkInput>) {
    return this.prisma.jobSeekerSocialLink.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.jobSeekerSocialLink.delete({ where: { id } });
  }
}
