import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PreferenceInput } from './types';

const DEFAULT_PREFERENCES: PreferenceInput = {
  email_notifications: true,
  push_notifications: true,
  ai_recommendations: true,
  roles: [],
  preferred_job_types: [],
  preferred_industries: [],
  preferred_locations: [],
  work_setup: [],
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: 'MONTHLY',
  things_to_avoid: null,
  source: 'AI_SUGGESTED',
  seniority: null,
  years_experience: null,
  availability: null,
  employment_status: null,
  willing_to_relocate: false,
  visa_sponsorship_required: false,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  work_authorization: [],
  auto_apply_consent: false,
};

@Injectable()
export class JobSeekerPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async get(job_seeker_id: string) {
    const preferences = await this.prisma.jobSeekerPreference.findUnique({
      where: { job_seeker_id },
    });
    return preferences ?? { job_seeker_id, ...DEFAULT_PREFERENCES };
  }

  upsert(job_seeker_id: string, data: Partial<PreferenceInput>) {
    return this.prisma.jobSeekerPreference.upsert({
      where: { job_seeker_id },
      create: { job_seeker_id, ...DEFAULT_PREFERENCES, ...data },
      update: data,
    });
  }
}
