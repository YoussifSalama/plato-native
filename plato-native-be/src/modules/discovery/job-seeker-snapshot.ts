import { PrismaService } from '../prisma/prisma.service';
import type { CvAnalysis } from '../profile-extraction/cv-analysis.service';
import { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';
import { onboardingOptions } from '../../common/onboarding-options';
import { resolveCountry } from './countries';

const INDUSTRY_LABELS = new Map(
  onboardingOptions.industries.map((o) => [o.value, o.label]),
);

// Everything the search/filter layers (discovery query-builder + BM25
// matching) need from a job seeker, assembled once so both layers read the
// same picture instead of each re-fetching and re-deriving it separately.
export interface JobSeekerSnapshot {
  skills: string[];
  roles: string[];
  preferredIndustries: string[];
  preferredLocations: string[];
  workSetup: string[];
  jobTypes: string[];
  experienceKeywords: string[];
  yearsExperience: string | null;
  seniority: string | null;
  // Work history, newest first: the evidence search titles are planned from.
  experiences: {
    title: string;
    technologies: string[];
    description: string | null;
    start: string | null;
    end: string | null;
  }[];
  willingToRelocate: boolean;
  visaSponsorshipRequired: boolean;
  // Where they live now (ISO code), from the profile's location.
  residenceCountry: string | null;
  // Countries they may work in besides home (codes or names, as saved).
  workAuthorization?: string[];
  employmentStatus: string | null;
  salary: {
    min: number | null;
    currency: string | null;
    period: 'MONTHLY' | 'YEARLY';
  };
  // Left out of every search: companies, and words in a job title (preferences).
  avoidCompanies?: string[];
  avoidWords?: string[];
}

// Profile location is { city, country } JSON; either half can place them.
export function residenceOf(location: unknown): string | null {
  if (!location || typeof location !== 'object') return null;
  const { city, country } = location as { city?: string; country?: string };
  return (
    (country && resolveCountry(country)) ||
    resolveCountry([city, country].filter(Boolean).join(', ')) ||
    null
  );
}

export async function buildJobSeekerSnapshot(
  prisma: PrismaService,
  preferenceService: JobSeekerPreferenceService,
  jobSeekerId: string,
): Promise<JobSeekerSnapshot> {
  const [jobSeeker, preferences] = await Promise.all([
    prisma.jobSeeker.findUnique({
      where: { id: jobSeekerId },
      include: { experiences: { orderBy: { start_date: 'desc' } } },
    }),
    preferenceService.get(jobSeekerId),
  ]);

  return {
    skills: jobSeeker?.skills ?? [],
    roles: preferences.roles,
    preferredIndustries: preferences.preferred_industries.map(
      (i) => INDUSTRY_LABELS.get(i) ?? i,
    ),
    preferredLocations: preferences.preferred_locations,
    workSetup: preferences.work_setup,
    jobTypes: preferences.preferred_job_types,
    experienceKeywords: [
      ...(jobSeeker?.experiences.map((e) => e.title) ?? []),
      ...(jobSeeker?.experiences.flatMap((e) => e.technologies) ?? []),
    ],
    yearsExperience: preferences.years_experience,
    seniority: preferences.seniority,
    experiences: (jobSeeker?.experiences ?? []).map((e) => ({
      title: e.title,
      technologies: e.technologies,
      description: e.description,
      start: e.start_date?.toISOString().slice(0, 10) ?? null,
      end: e.end_date?.toISOString().slice(0, 10) ?? null,
    })),
    willingToRelocate: preferences.willing_to_relocate,
    visaSponsorshipRequired: preferences.visa_sponsorship_required,
    residenceCountry: residenceOf(jobSeeker?.location),
    workAuthorization: preferences.work_authorization ?? [],
    avoidCompanies: preferences.avoid_companies ?? [],
    avoidWords: preferences.avoid_words ?? [],
    employmentStatus: preferences.employment_status,
    salary: {
      min: preferences.salary_min,
      currency: preferences.salary_currency,
      period: preferences.salary_period === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
    },
  };
}

/** What a CV says about the person (skills, roles held, dates), in the snapshot's shape. */
export function cvFacts(cv: CvAnalysis['extraction']) {
  const exps = [...cv.experience].sort((a, b) =>
    (b.start_date ?? '').localeCompare(a.start_date ?? ''),
  );
  return {
    skills: cv.skills,
    experienceKeywords: [
      ...exps.map((e) => e.title),
      ...exps.flatMap((e) => e.technologies),
    ],
    experiences: exps.map((e) => ({
      title: e.title,
      technologies: e.technologies,
      description: e.description,
      start: e.start_date,
      end: e.end_date,
    })),
  };
}

/**
 * The profile with another CV's facts in place of its own ("Search with a different CV"). What the person wants
 * (roles, places, pay, visa, where they live) stays; the level and years come from that CV's dates, not the
 * profile's (a CV for another career would otherwise inherit the profile's seniority).
 */
export function withCv(
  s: JobSeekerSnapshot,
  cv: CvAnalysis['extraction'],
): JobSeekerSnapshot {
  return { ...s, ...cvFacts(cv), yearsExperience: null, seniority: null };
}
