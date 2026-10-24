import {
  Gender,
  JobSeekerDocumentStatus,
  JobSeekerDocumentType,
  Prisma,
} from '@prisma/client';

export interface CreateUserInput {
  full_name: string;
  email: string;
  phone: string;
  password_hash: string;
  gender?: Gender;
}

export type UpdateUserInput = Partial<CreateUserInput>;

export interface JobSeekerInput {
  bio?: string;
  avatar_url?: string;
  location?: Prisma.InputJsonValue;
  website?: string;
  birth_date?: Date;
}

export interface SocialLinkInput {
  platform: string;
  url: string;
}

export interface DocumentInput {
  type: JobSeekerDocumentType;
  url: string;
  name?: string;
  storage_key: string;
  document_version_id: string;
}

export interface UpdateDocumentInput {
  status?: JobSeekerDocumentStatus;
  extracted_text?: string;
  processing_error?: string;
  storage_key?: string;
  url?: string;
  name?: string;
}

export interface PreferenceInput {
  email_notifications: boolean;
  push_notifications: boolean;
  ai_recommendations: boolean;
  roles: string[];
  preferred_job_types: string[];
  preferred_industries: string[];
  preferred_locations: string[];
  work_setup: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string;
  things_to_avoid: string | null;
  source: string;
  seniority: string | null;
  years_experience: string | null;
  availability: string | null;
  employment_status: string | null;
  willing_to_relocate: boolean;
  visa_sponsorship_required: boolean;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  work_authorization: string[];
  auto_apply_consent: boolean;
}
