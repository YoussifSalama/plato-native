import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { totalYears } from '../apply/answer-mapper';
import { resolveCountry } from '../discovery/countries';
import { PrismaService } from '../prisma/prisma.service';
import { skillKey } from './resume-facts';
import { Market, MarketOverrides, ResumeProfile } from './resume.types';

// Reads and writes the candidate profile facts a resume depends on. The
// profile is the source of truth: resumes are generated from it, never the
// other way round.

const presentableName = (name: string) =>
  name === name.toUpperCase() || name === name.toLowerCase()
    ? name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
    : name;
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

@Injectable()
export class ResumeProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async load(jobSeekerId: string): Promise<ResumeProfile> {
    const s = await this.prisma.jobSeeker.findUniqueOrThrow({
      where: { id: jobSeekerId },
      include: {
        user: true,
        preferences: true,
        social_links: true,
        experiences: { orderBy: { start_date: 'desc' } },
        educations: { orderBy: { end_date: 'desc' } },
        languages: true,
        certifications: true,
        projects: { orderBy: { created_at: 'asc' } },
        achievements: { orderBy: { created_at: 'asc' } },
        skill_evidence: true,
        resume_settings: true,
      },
    });
    const social = (p: string) =>
      s.social_links.find((l) => l.platform.toLowerCase().includes(p))?.url;
    const loc = s.location as { city?: string; country?: string } | null;
    const location = [loc?.city, loc?.country].filter(Boolean).join(', ');
    const current = s.experiences.find((e) => !e.end_date) ?? s.experiences[0];
    const prefs = s.preferences;
    return {
      fullName: presentableName(s.user.full_name),
      email: s.user.email,
      phone: s.user.phone,
      location,
      country: location ? resolveCountry(location) : null,
      summary: s.bio ?? '',
      headline: current?.title ?? '',
      skills: s.skills,
      links: {
        linkedin: prefs?.linkedin_url ?? social('linkedin'),
        github: prefs?.github_url ?? social('github'),
        portfolio: prefs?.portfolio_url ?? s.website ?? social('portfolio'),
      },
      experiences: s.experiences.map((e) => ({
        title: e.title,
        company: e.company,
        start: day(e.start_date),
        end: day(e.end_date),
        description: e.description,
        technologies: e.technologies,
      })),
      educations: s.educations.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        end: day(e.end_date),
      })),
      languages: s.languages.map((l) => ({
        language: l.language,
        proficiency: l.proficiency,
      })),
      certifications: s.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
      })),
      projects: s.projects.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        description: p.description,
        technologies: p.technologies,
        url: p.url,
        result: p.result,
      })),
      achievements: s.achievements.map((a) => ({
        id: a.id,
        company: a.company,
        projectName: a.project_name,
        text: a.text,
        metric: a.metric,
      })),
      skillEvidence: s.skill_evidence.map((e) => ({
        skill: e.skill,
        level: e.level,
        proof: e.proof,
        url: e.url,
      })),
      nationality: s.resume_settings?.nationality ?? null,
      marketOverrides: (s.resume_settings?.market_overrides ??
        {}) as MarketOverrides,
      totalYears: totalYears(
        s.experiences.map((e) => ({ start: day(e.start_date) })),
      ),
    };
  }

  addProject(
    jobSeekerId: string,
    d: {
      name: string;
      role: string | null;
      description: string;
      technologies: string[];
      url: string | null;
      result: string | null;
    },
  ) {
    return this.prisma.jobSeekerProject.create({
      data: { job_seeker_id: jobSeekerId, ...d },
    });
  }

  addAchievement(
    jobSeekerId: string,
    d: {
      company: string | null;
      projectName: string | null;
      text: string;
      metric: string | null;
    },
  ) {
    return this.prisma.jobSeekerAchievement.create({
      data: {
        job_seeker_id: jobSeekerId,
        company: d.company,
        project_name: d.projectName,
        text: d.text,
        metric: d.metric,
        source: 'USER',
      },
    });
  }

  // One row per skill: confirming again updates the proof.
  upsertSkillEvidence(
    jobSeekerId: string,
    d: {
      skill: string;
      level: 'LEARNING' | 'WORKING' | 'STRONG';
      proof: string;
      url: string | null;
    },
  ) {
    const skill_key = skillKey(d.skill);
    return this.prisma.jobSeekerSkillEvidence.upsert({
      where: {
        job_seeker_id_skill_key: { job_seeker_id: jobSeekerId, skill_key },
      },
      create: {
        job_seeker_id: jobSeekerId,
        skill_key,
        skill: d.skill,
        level: d.level,
        proof: d.proof,
        url: d.url,
      },
      update: {
        skill: d.skill,
        level: d.level,
        proof: d.proof,
        url: d.url,
        confirmed_at: new Date(),
      },
    });
  }

  async saveSettings(
    jobSeekerId: string,
    d: {
      nationality?: string | null;
      market?: Market;
      personalBlock?: boolean;
    },
  ) {
    const current = await this.prisma.jobSeekerResumeSettings.findUnique({
      where: { job_seeker_id: jobSeekerId },
    });
    const overrides = {
      ...((current?.market_overrides ?? {}) as MarketOverrides),
    };
    if (d.market && d.personalBlock !== undefined)
      overrides[d.market] = {
        ...overrides[d.market],
        personalBlock: d.personalBlock,
      };
    const data = {
      market_overrides: overrides as Prisma.InputJsonValue,
      ...(d.nationality !== undefined && { nationality: d.nationality }),
    };
    await this.prisma.jobSeekerResumeSettings.upsert({
      where: { job_seeker_id: jobSeekerId },
      create: { job_seeker_id: jobSeekerId, ...data },
      update: data,
    });
  }

  // The facts the seeker can edit, for the profile screen.
  async facts(jobSeekerId: string) {
    const [projects, achievements, skills, settings] = await Promise.all([
      this.prisma.jobSeekerProject.findMany({
        where: { job_seeker_id: jobSeekerId },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.jobSeekerAchievement.findMany({
        where: { job_seeker_id: jobSeekerId },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.jobSeekerSkillEvidence.findMany({
        where: { job_seeker_id: jobSeekerId },
        orderBy: { confirmed_at: 'asc' },
      }),
      this.prisma.jobSeekerResumeSettings.findUnique({
        where: { job_seeker_id: jobSeekerId },
      }),
    ]);
    return {
      projects,
      achievements,
      skills,
      settings: {
        nationality: settings?.nationality ?? null,
        marketOverrides: (settings?.market_overrides ?? {}) as MarketOverrides,
      },
    };
  }

  // Scoped to the owner: another seeker's id deletes nothing.
  async remove(
    jobSeekerId: string,
    kind: 'projects' | 'achievements' | 'skills',
    id: string,
  ) {
    const where = { id, job_seeker_id: jobSeekerId };
    if (kind === 'projects')
      await this.prisma.jobSeekerProject.deleteMany({ where });
    else if (kind === 'achievements')
      await this.prisma.jobSeekerAchievement.deleteMany({ where });
    else await this.prisma.jobSeekerSkillEvidence.deleteMany({ where });
  }
}
