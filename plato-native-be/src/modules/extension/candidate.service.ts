import { Injectable } from '@nestjs/common';
import { splitName, totalYears } from '../apply/answer-mapper';
import { AnswerValue, Candidate } from '../apply/apply.types';
import { PrismaService } from '../prisma/prisma.service';

// Same rule as the legacy apply worker: names typed IN CAPITALS at signup
// shouldn't shout at a recruiter.
const presentableName = (name: string) =>
  name === name.toUpperCase() || name === name.toLowerCase()
    ? name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase())
    : name;

// The seeker's application snapshot for the extension engine. A copy of the
// legacy worker's private loader, so the legacy executor is not imported
// (parity is pinned by candidate.parity.spec.ts).
@Injectable()
export class CandidateService {
  constructor(private readonly prisma: PrismaService) {}

  async load(jobSeekerId: string): Promise<Candidate> {
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({
      where: { id: jobSeekerId },
      include: {
        user: true,
        preferences: true,
        social_links: true,
        experiences: { orderBy: { start_date: 'desc' } },
        educations: { orderBy: { end_date: 'desc' } },
        languages: true,
        certifications: true,
        documents: {
          where: { type: 'CV_RESUME', status: 'READY' },
          select: { id: true },
          take: 1,
        },
      },
    });
    const prefs = seeker.preferences;
    const social = (platform: string) =>
      seeker.social_links.find((l) =>
        l.platform.toLowerCase().includes(platform),
      )?.url;
    const location = seeker.location as {
      city?: string;
      country?: string;
    } | null;
    const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
    const current =
      seeker.experiences.find((e) => !e.end_date) ?? seeker.experiences[0];

    // Names typed IN CAPITALS at signup shouldn't shout at a recruiter.
    const fullName = presentableName(seeker.user.full_name);
    return {
      fullName,
      ...splitName(fullName),
      email: seeker.user.email,
      phone: seeker.user.phone,
      location: [location?.city, location?.country].filter(Boolean).join(', '),
      headline: current?.title ?? '',
      currentCompany: current?.company ?? '',
      summary: seeker.bio ?? '',
      skills: seeker.skills,
      links: {
        linkedin: prefs?.linkedin_url ?? social('linkedin'),
        github: prefs?.github_url ?? social('github'),
        portfolio:
          prefs?.portfolio_url ?? seeker.website ?? social('portfolio'),
      },
      preferences: {
        salaryMin: prefs?.salary_min ?? null,
        salaryMax: prefs?.salary_max ?? null,
        salaryCurrency: prefs?.salary_currency ?? null,
        salaryPeriod: prefs?.salary_period ?? null,
        availability: prefs?.availability ?? null,
        yearsExperience: prefs?.years_experience ?? null,
        willingToRelocate: prefs?.willing_to_relocate ?? false,
        visaSponsorshipRequired: prefs?.visa_sponsorship_required ?? false,
        workAuthorization: prefs?.work_authorization ?? [],
        autoApplyConsent: prefs?.auto_apply_consent ?? false,
      },
      languages: seeker.languages.map((l) => ({
        language: l.language,
        proficiency: l.proficiency,
      })),
      certifications: seeker.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
      })),
      hasResume: seeker.documents.length > 0,
      country: location?.country ?? '',
      totalYears: totalYears(
        seeker.experiences.map((e) => ({ start: day(e.start_date) })),
      ),
      facts: (seeker.apply_facts ?? {}) as Record<string, AnswerValue>,
      experiences: seeker.experiences.map((e) => ({
        title: e.title,
        company: e.company,
        start: day(e.start_date),
        end: day(e.end_date),
        description: e.description,
      })),
      educations: seeker.educations.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        start: day(e.start_date),
        end: day(e.end_date),
      })),
      answerBank: (seeker.apply_answers ?? {}) as Record<string, AnswerValue>,
    };
  }
}
