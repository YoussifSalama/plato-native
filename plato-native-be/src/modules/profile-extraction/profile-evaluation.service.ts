import { Injectable } from '@nestjs/common';
import { SectionStatus } from '@prisma/client';
import {
  ExtractionOutput,
  Finding,
  SectionKey,
} from './profile-extraction.schema';

export interface ProfileEvaluation {
  experience: SectionStatus;
  education: SectionStatus;
  skills: SectionStatus;
  certifications: SectionStatus;
  languages: SectionStatus;
  location: SectionStatus;
}

const LOOKS_GOOD = SectionStatus.LOOKS_GOOD;
const NEEDS_ATTENTION = SectionStatus.NEEDS_ATTENTION;

interface HasCompanyTitleStart {
  company: string;
  title: string;
  start_date?: unknown;
}
interface HasInstitutionDegree {
  institution: string;
  degree: string;
}
interface HasName {
  name: string;
}
interface HasLanguage {
  language: string;
}

@Injectable()
export class ProfileEvaluationService {
  // Each of these is reused by both the initial AI-extraction pass and the
  // manual per-section edit endpoints, so "fix the flagged thing" always
  // re-evaluates with the exact same rule the initial pass used.
  evaluateExperience(items: HasCompanyTitleStart[]): SectionStatus {
    return items.length === 0 ||
      items.some((e) => !e.company || !e.title || !e.start_date)
      ? NEEDS_ATTENTION
      : LOOKS_GOOD;
  }

  evaluateEducation(items: HasInstitutionDegree[]): SectionStatus {
    return items.some((e) => !e.institution || !e.degree)
      ? NEEDS_ATTENTION
      : LOOKS_GOOD;
  }

  evaluateSkills(skills: string[]): SectionStatus {
    return skills.length < 3 ? NEEDS_ATTENTION : LOOKS_GOOD;
  }

  evaluateCertifications(items: HasName[]): SectionStatus {
    return items.some((c) => !c.name) ? NEEDS_ATTENTION : LOOKS_GOOD;
  }

  evaluateLanguages(items: HasLanguage[]): SectionStatus {
    return items.some((l) => !l.language) ? NEEDS_ATTENTION : LOOKS_GOOD;
  }

  evaluateLocation(
    location:
      { city?: string | null; country?: string | null } | null | undefined,
  ): SectionStatus {
    return !location?.city && !location?.country ? NEEDS_ATTENTION : LOOKS_GOOD;
  }

  evaluate(data: Omit<ExtractionOutput, 'findings'>): ProfileEvaluation {
    return {
      experience: this.evaluateExperience(data.experience),
      education: this.evaluateEducation(data.education),
      skills: this.evaluateSkills(data.skills),
      certifications: this.evaluateCertifications(data.certifications),
      languages: this.evaluateLanguages(data.languages),
      location: this.evaluateLocation(data.location),
    };
  }

  private static readonly DETERMINISTIC_MESSAGES: Record<
    SectionKey,
    { title: string; message: string }
  > = {
    experience: {
      title: 'Some work experience details need your confirmation',
      message:
        'One or more roles are missing a company, title, or start date — or no work experience was found at all.',
    },
    education: {
      title: 'Some education details need your confirmation',
      message: 'One or more entries are missing an institution or degree.',
    },
    skills: {
      title: 'Your skills list could use a bit more detail',
      message:
        'Fewer than 3 skills were found — adding more helps us match you to better opportunities.',
    },
    certifications: {
      title: 'A certification needs your confirmation',
      message: 'One of your certifications is missing its name.',
    },
    languages: {
      title: 'A language entry needs your confirmation',
      message: 'One of your languages is missing its name.',
    },
    location: {
      title: 'We couldn’t find your location',
      message: "We couldn't determine a city or country from your documents.",
    },
  };

  // The AI's own audit is often conservative and returns no findings even
  // when a section fails the deterministic check (small/cheap models miss
  // things). Without this, "Needs your attention" can end up empty while
  // section badges are still flagged — confusing. Every NEEDS_ATTENTION
  // section always gets *some* explanation: the AI's if it gave one,
  // otherwise a generic one synthesized from the same deterministic rule
  // that flagged it.
  augmentFindings(
    deterministic: ProfileEvaluation,
    aiFindings: Finding[],
  ): Finding[] {
    const coveredSections = new Set<SectionKey>();
    for (const finding of aiFindings) {
      for (const section of finding.sections) coveredSections.add(section);
    }

    const synthesized: Finding[] = (Object.keys(deterministic) as SectionKey[])
      .filter(
        (key) =>
          deterministic[key] === NEEDS_ATTENTION && !coveredSections.has(key),
      )
      .map((key) => ({
        category: 'missing_information' as const,
        sections: [key],
        ...ProfileEvaluationService.DETERMINISTIC_MESSAGES[key],
      }));

    return [...aiFindings, ...synthesized];
  }

  // A section is NEEDS_ATTENTION if either the deterministic check fails
  // or the AI audit raised a finding naming it — the findings list both
  // explains "why" (shown in the UI) and determines the badge, so the two
  // can never contradict each other.
  deriveStatuses(
    deterministic: ProfileEvaluation,
    findings: Finding[],
  ): ProfileEvaluation {
    const flagged = new Set<SectionKey>();
    for (const finding of findings) {
      for (const section of finding.sections) flagged.add(section);
    }
    const withFindings = (section: SectionKey, status: SectionStatus) =>
      status === NEEDS_ATTENTION || flagged.has(section)
        ? NEEDS_ATTENTION
        : LOOKS_GOOD;

    return {
      experience: withFindings('experience', deterministic.experience),
      education: withFindings('education', deterministic.education),
      skills: withFindings('skills', deterministic.skills),
      certifications: withFindings(
        'certifications',
        deterministic.certifications,
      ),
      languages: withFindings('languages', deterministic.languages),
      location: withFindings('location', deterministic.location),
    };
  }
}
