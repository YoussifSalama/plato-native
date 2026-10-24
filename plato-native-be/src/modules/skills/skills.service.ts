import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findGaps } from '../resume/resume-checks';
import { ResumeProfileService } from '../resume/resume-profile.service';
import { aggregate, skillsIn } from './skills-gap';
import { courseById, coursesFor } from './catalog';
import { verifyCredential } from './credential-verify';

// Best-matching jobs looked at. ponytail: skills come from a curated word list, add a per-job model pass if the list misses too much.
const JOBS = 300;

export interface CredentialInput {
  skill: string;
  courseId?: string;
  title?: string;
  provider?: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  credentialUrl?: string;
  documentId?: string;
  completedAt?: Date;
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ResumeProfileService,
  ) {}

  async gap(userId: string) {
    const seeker = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!seeker) throw new NotFoundException('Job seeker profile not found');
    const [profile, matches] = await Promise.all([
      this.profiles.load(seeker.id),
      this.prisma.jobSeekerJobMatch.findMany({
        where: {
          job_seeker_id: seeker.id,
          hidden: false,
          match_score: { not: null },
          job: { expired_at: null },
        },
        orderBy: { match_score: 'desc' },
        take: JOBS,
        select: { job: { select: { title: true, description: true } } },
      }),
    ]);
    // Only jobs that name at least one known skill can say anything about gaps.
    const wanted = matches
      .map((m) => skillsIn(`${m.job.title}\n${m.job.description ?? ''}`))
      .filter((s) => s.length);
    const missing = wanted.map((s) => findGaps(s, profile, []));
    return {
      jobsAnalysed: wanted.length,
      // Each gap comes with where to learn it (curated, free first).
      skills: aggregate(missing).map((s) => ({
        ...s,
        courses: coursesFor(s.skill),
      })),
    };
  }

  private async seekerOf(userId: string) {
    const seeker = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      select: { id: true, skills: true, user: { select: { full_name: true } } },
    });
    if (!seeker) throw new NotFoundException('Job seeker profile not found');
    return seeker;
  }

  async credentials(userId: string) {
    const seeker = await this.seekerOf(userId);
    return this.prisma.skillCredential.findMany({
      where: { job_seeker_id: seeker.id },
      orderBy: { created_at: 'desc' },
    });
  }

  async addCredential(userId: string, d: CredentialInput) {
    const seeker = await this.seekerOf(userId);
    const course = d.courseId ? courseById(d.courseId) : undefined;
    if (d.courseId && !course) throw new BadRequestException('Unknown course');
    const title = course?.title ?? d.title;
    if (!title)
      throw new BadRequestException('Say which course or certification');
    if (d.documentId) await this.ownDocument(seeker.id, d.documentId);
    const row = await this.prisma.skillCredential.create({
      data: {
        job_seeker_id: seeker.id,
        skill: d.skill,
        course_id: course?.id ?? null,
        title,
        provider: course?.provider ?? d.provider ?? null,
        status: d.status,
        credential_url: d.credentialUrl ?? null,
        document_id: d.documentId ?? null,
        completed_at:
          d.status === 'COMPLETED' ? (d.completedAt ?? new Date()) : null,
      },
    });
    return this.check(seeker, row.id);
  }

  async updateCredential(
    userId: string,
    id: string,
    d: Partial<CredentialInput>,
  ) {
    const seeker = await this.seekerOf(userId);
    const row = await this.prisma.skillCredential.findFirst({
      where: { id, job_seeker_id: seeker.id },
    });
    if (!row) throw new NotFoundException('Credential not found');
    if (d.documentId) await this.ownDocument(seeker.id, d.documentId);
    await this.prisma.skillCredential.update({
      where: { id },
      data: {
        ...(d.status && { status: d.status }),
        ...(d.credentialUrl !== undefined && {
          credential_url: d.credentialUrl,
        }),
        ...(d.documentId !== undefined && { document_id: d.documentId }),
        ...(d.status === 'COMPLETED' &&
          !row.completed_at && { completed_at: d.completedAt ?? new Date() }),
        // Anything changed means the old check no longer counts.
        verification: 'SELF_REPORTED',
        verification_note: null,
        verified_issuer: null,
        verified_at: null,
      },
    });
    return this.check(seeker, id);
  }

  async removeCredential(userId: string, id: string) {
    const seeker = await this.seekerOf(userId);
    const { count } = await this.prisma.skillCredential.deleteMany({
      where: { id, job_seeker_id: seeker.id },
    });
    if (!count) throw new NotFoundException('Credential not found');
    return { removed: id };
  }

  private async ownDocument(jobSeekerId: string, documentId: string) {
    const doc = await this.prisma.jobSeekerDocument.findFirst({
      where: { id: documentId, job_seeker_id: jobSeekerId },
      select: { id: true },
    });
    if (!doc) throw new BadRequestException('That document is not yours');
  }

  // Looks at a completed credential's link and, when it checks out, adds it to
  // the profile. An uploaded file or an unreadable link stays self-reported.
  private async check(
    seeker: { id: string; skills: string[]; user: { full_name: string } },
    id: string,
  ) {
    const row = await this.prisma.skillCredential.findUniqueOrThrow({
      where: { id },
    });
    if (row.status !== 'COMPLETED') return row;
    let data: Prisma.SkillCredentialUpdateInput = {
      verification_note: row.document_id
        ? 'Uploaded certificates are kept as self-reported: a file cannot be checked. Add the public link to verify it.'
        : 'Add the public link to your certificate to have it checked.',
    };
    if (row.credential_url) {
      const v = await verifyCredential(
        row.credential_url,
        seeker.user.full_name,
        row.title,
      );
      data = {
        verification: v.status === 'VERIFIED' ? 'VERIFIED' : 'SELF_REPORTED',
        verification_note: v.note,
        verified_issuer: v.issuer,
        verified_at: v.status === 'VERIFIED' ? new Date() : null,
      };
    }
    const saved = await this.prisma.skillCredential.update({
      where: { id },
      data,
    });
    if (saved.verification === 'VERIFIED')
      await this.addToProfile(seeker, saved);
    return saved;
  }

  // Verified and completed: a certification entry, working-level skill evidence
  // (never lowering a stronger one), and the skill in the matching word list.
  private async addToProfile(
    seeker: { id: string; skills: string[] },
    c: {
      skill: string;
      title: string;
      provider: string | null;
      verified_issuer: string | null;
      credential_url: string | null;
      completed_at: Date | null;
    },
  ) {
    const issuer = c.verified_issuer ?? c.provider;
    const have = await this.prisma.jobSeekerCertification.findFirst({
      where: { job_seeker_id: seeker.id, name: c.title },
      select: { id: true },
    });
    if (!have)
      await this.prisma.jobSeekerCertification.create({
        data: {
          job_seeker_id: seeker.id,
          name: c.title,
          issuer,
          issue_date: c.completed_at,
        },
      });
    const key = c.skill.trim().toLowerCase();
    const evidence = await this.prisma.jobSeekerSkillEvidence.findUnique({
      where: {
        job_seeker_id_skill_key: { job_seeker_id: seeker.id, skill_key: key },
      },
      select: { level: true },
    });
    if (!evidence || evidence.level === 'LEARNING')
      await this.profiles.upsertSkillEvidence(seeker.id, {
        skill: c.skill,
        level: 'WORKING',
        proof: `Completed ${c.title}${issuer ? ` (${issuer}, link checked)` : ''}`,
        url: c.credential_url,
      });
    if (!seeker.skills.some((s) => s.toLowerCase() === key))
      await this.prisma.jobSeeker.update({
        where: { id: seeker.id },
        data: { skills: { push: c.skill } },
      });
  }
}
