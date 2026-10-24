// Shared vocabulary of the resume engine. The candidate profile is the source
// of truth: a ResumeProfile is read from it, a ResumeDoc is generated from it.

export type Market = 'US' | 'CA' | 'UK' | 'DE' | 'EU' | 'GCC' | 'EG' | 'OTHER';
export type Stage = 'entry' | 'junior' | 'mid' | 'senior';
export type TemplateId = 'classic' | 'modern';
export type SectionKey =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'certifications'
  | 'languages';

export interface ProfileExperience {
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  description: string | null;
  technologies: string[];
}
export interface ProfileProject {
  id: string;
  name: string;
  role: string | null;
  description: string;
  technologies: string[];
  url: string | null;
  result: string | null;
}
export interface ProfileAchievement {
  id: string;
  company: string | null;
  projectName: string | null;
  text: string;
  metric: string | null;
}
export interface SkillEvidence {
  skill: string;
  level: string;
  proof: string;
  url: string | null;
}
export type MarketOverrides = Partial<
  Record<Market, { personalBlock?: boolean }>
>;

export interface ResumeProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  // ISO code of where the seeker lives, when known.
  country: string | null;
  summary: string;
  headline: string;
  skills: string[];
  links: { linkedin?: string; github?: string; portfolio?: string };
  experiences: ProfileExperience[];
  educations: {
    institution: string;
    degree: string;
    field: string | null;
    end: string | null;
  }[];
  languages: { language: string; proficiency: string | null }[];
  certifications: { name: string; issuer: string | null }[];
  projects: ProfileProject[];
  achievements: ProfileAchievement[];
  skillEvidence: SkillEvidence[];
  nationality: string | null;
  marketOverrides: MarketOverrides;
  totalYears: number | null;
}

// What the strategy engine decides. Pure rules, never the model.
export interface ResumeStrategy {
  market: Market;
  stage: Stage;
  careerChanger: boolean;
  format: 'chronological' | 'hybrid';
  maxPages: 1 | 2 | 3;
  sections: SectionKey[];
  nationality: boolean;
  // Policy for the market. MVP renders no photo in any case.
  photo: 'avoid' | 'optional' | 'none';
  template: TemplateId;
  // Plain-language why, shown to the seeker.
  reasons: string[];
}

export interface DocBullet {
  text: string;
}
export interface ResumeDoc {
  name: string;
  // Line under the name; mirrors the job title when the profile supports it.
  headline: string;
  contact: string[];
  nationality: string | null;
  sections: SectionKey[];
  summary: string;
  skills: string[];
  // Skills the seeker is learning, shown as such and never as proficiency.
  learning: string[];
  experiences: {
    title: string;
    company: string;
    start: string | null;
    end: string | null;
    bullets: string[];
  }[];
  projects: {
    name: string;
    role: string | null;
    url: string | null;
    bullets: string[];
  }[];
  educations: ResumeProfile['educations'];
  certifications: ResumeProfile['certifications'];
  languages: ResumeProfile['languages'];
  template: TemplateId;
  // Tighter spacing, used once when the page limit is exceeded.
  compact: boolean;
}

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
