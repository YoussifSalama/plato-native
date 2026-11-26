import { Injectable } from '@nestjs/common';
import type {
  EvaluationInput,
  ReplaceProfileInput,
} from '../user/job-seeker-profile.service';
import { ProfileExtractionAgentService } from './profile-extraction-agent.service';
import { ProfileEvaluationService } from './profile-evaluation.service';
import { ExtractionOutput, Finding } from './profile-extraction.schema';

/** What Plato reads from a CV: the profile, each section's status and the findings. JSON-safe (dates stay strings). */
export type CvAnalysis = {
  extraction: ExtractionOutput;
  evaluation: EvaluationInput;
  findings: Finding[];
};

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** The analysis as the profile stores it (replaceProfile). */
export function profileInputOf({
  extraction,
  evaluation,
  findings,
}: CvAnalysis): ReplaceProfileInput {
  return {
    experiences: extraction.experience.map((e) => ({
      company: e.company,
      title: e.title,
      start_date: parseDate(e.start_date),
      end_date: parseDate(e.end_date),
      description: e.description ?? undefined,
      technologies: e.technologies,
    })),
    educations: extraction.education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      field: e.field ?? undefined,
      start_date: parseDate(e.start_date),
      end_date: parseDate(e.end_date),
    })),
    certifications: extraction.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer ?? undefined,
      issue_date: parseDate(c.issue_date),
      expiration_date: parseDate(c.expiration_date),
    })),
    languages: extraction.languages.map((l) => ({
      language: l.language,
      proficiency: l.proficiency ?? undefined,
    })),
    skills: extraction.skills,
    location: extraction.location,
    evaluation,
    findings,
  };
}

// One reading of a CV for onboarding (an account) and the public search (a guest, before signing up).
@Injectable()
export class CvAnalysisService {
  constructor(
    private readonly agent: ProfileExtractionAgentService,
    private readonly evaluator: ProfileEvaluationService,
  ) {}

  async analyze(text: string): Promise<CvAnalysis> {
    const raw = await this.agent.extract(text);
    // Defense-in-depth against the model padding a list with a blank entry: drop anything missing its required text.
    const extraction = {
      ...raw,
      experience: raw.experience.filter((e) => e.company && e.title),
      education: raw.education.filter((e) => e.institution && e.degree),
      certifications: raw.certifications.filter((c) => c.name),
      languages: raw.languages.filter((l) => l.language),
    };
    const deterministic = this.evaluator.evaluate(extraction);
    return {
      extraction,
      evaluation: this.evaluator.deriveStatuses(
        deterministic,
        extraction.findings,
      ),
      findings: this.evaluator.augmentFindings(
        deterministic,
        extraction.findings,
      ),
    };
  }
}
