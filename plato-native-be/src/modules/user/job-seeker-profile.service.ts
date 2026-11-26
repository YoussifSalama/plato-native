import { Injectable } from '@nestjs/common';
import { Prisma, SectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ExperienceInput {
  company: string;
  title: string;
  start_date?: Date;
  end_date?: Date;
  description?: string;
  technologies?: string[];
}

export interface EducationInput {
  institution: string;
  degree: string;
  field?: string;
  start_date?: Date;
  end_date?: Date;
}

export interface CertificationInput {
  name: string;
  issuer?: string;
  issue_date?: Date;
  expiration_date?: Date;
}

export interface LanguageInput {
  language: string;
  proficiency?: string;
}

export interface LocationInput {
  city?: string;
  country?: string;
}

export interface EvaluationInput {
  experience: SectionStatus;
  education: SectionStatus;
  skills: SectionStatus;
  certifications: SectionStatus;
  languages: SectionStatus;
  location: SectionStatus;
}

export interface ReplaceProfileInput {
  experiences: ExperienceInput[];
  educations: EducationInput[];
  certifications: CertificationInput[];
  languages: LanguageInput[];
  skills: string[];
  location: LocationInput | null;
  evaluation: EvaluationInput;
  findings: unknown[];
}

const key = (s: string) => s.trim().toLowerCase();

export function withVerified(
  data: ReplaceProfileInput,
  verified: {
    skill: string;
    title: string;
    provider: string | null;
    verified_issuer: string | null;
    completed_at: Date | null;
  }[],
): ReplaceProfileInput {
  const certs = new Set(data.certifications.map((c) => key(c.name)));
  const skills = new Set(data.skills.map(key));
  const certifications = [...data.certifications];
  const skillList = [...data.skills];
  for (const v of verified) {
    if (!certs.has(key(v.title))) {
      certs.add(key(v.title));
      certifications.push({
        name: v.title,
        issuer: v.verified_issuer ?? v.provider ?? undefined,
        issue_date: v.completed_at ?? undefined,
      });
    }
    if (!skills.has(key(v.skill))) {
      skills.add(key(v.skill));
      skillList.push(v.skill);
    }
  }
  return { ...data, certifications, skills: skillList };
}

@Injectable()
export class JobSeekerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // Full replace, inside one transaction: either the whole profile lands
  // from this write or none of it does. Used by both the initial AI
  // analyze() pass and the single save-at-Continue edit endpoint.
  replaceProfile(job_seeker_id: string, input: ReplaceProfileInput) {
    return this.prisma.$transaction(async (tx) => {
      // A credential Plato verified (skills/skills.service.ts addToProfile)
      // outlives any re-read of the CV: its certification and skill come back.
      const verified = await tx.skillCredential.findMany({
        where: { job_seeker_id, status: 'COMPLETED', verification: 'VERIFIED' },
        select: {
          skill: true,
          title: true,
          provider: true,
          verified_issuer: true,
          completed_at: true,
        },
      });
      const data = withVerified(input, verified);
      await tx.jobSeekerExperience.deleteMany({ where: { job_seeker_id } });
      await tx.jobSeekerEducation.deleteMany({ where: { job_seeker_id } });
      await tx.jobSeekerCertification.deleteMany({ where: { job_seeker_id } });
      await tx.jobSeekerLanguage.deleteMany({ where: { job_seeker_id } });

      if (data.experiences.length) {
        await tx.jobSeekerExperience.createMany({
          data: data.experiences.map((e) => ({ job_seeker_id, ...e })),
        });
      }
      if (data.educations.length) {
        await tx.jobSeekerEducation.createMany({
          data: data.educations.map((e) => ({ job_seeker_id, ...e })),
        });
      }
      if (data.certifications.length) {
        await tx.jobSeekerCertification.createMany({
          data: data.certifications.map((c) => ({ job_seeker_id, ...c })),
        });
      }
      if (data.languages.length) {
        await tx.jobSeekerLanguage.createMany({
          data: data.languages.map((l) => ({ job_seeker_id, ...l })),
        });
      }

      await tx.jobSeeker.update({
        where: { id: job_seeker_id },
        data: {
          skills: data.skills,
          location: (data.location as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });

      await tx.jobSeekerProfileEvaluation.upsert({
        where: { job_seeker_id },
        create: {
          job_seeker_id,
          ...data.evaluation,
          findings: data.findings as Prisma.InputJsonValue,
        },
        update: {
          ...data.evaluation,
          findings: data.findings as Prisma.InputJsonValue,
        },
      });
    });
  }

  getEvaluation(job_seeker_id: string) {
    return this.prisma.jobSeekerProfileEvaluation.findUnique({
      where: { job_seeker_id },
    });
  }

  getFullProfile(job_seeker_id: string) {
    return this.prisma.jobSeeker.findUnique({
      where: { id: job_seeker_id },
      include: {
        experiences: true,
        educations: true,
        certifications: true,
        languages: true,
        profile_evaluation: true,
      },
    });
  }
}
