// Mirrors plato-native-be's profile-evaluation.service.ts deterministic
// rules exactly, so an edit's badge updates instantly without a round
// trip. Deliberate duplication — two separate codebases, no shared
// package — keep these two in sync by hand if the rule ever changes.
import type { Certification, Education, Experience, Language, SectionStatus } from "./documents/schema"

function evaluateExperience(items: Experience[]): SectionStatus {
  return items.length === 0 || items.some((e) => !e.company || !e.title || !e.start_date)
    ? "NEEDS_ATTENTION"
    : "LOOKS_GOOD"
}

function evaluateEducation(items: Education[]): SectionStatus {
  return items.some((e) => !e.institution || !e.degree) ? "NEEDS_ATTENTION" : "LOOKS_GOOD"
}

function evaluateSkills(skills: string[]): SectionStatus {
  return skills.length < 3 ? "NEEDS_ATTENTION" : "LOOKS_GOOD"
}

function evaluateCertifications(items: Certification[]): SectionStatus {
  return items.some((c) => !c.name) ? "NEEDS_ATTENTION" : "LOOKS_GOOD"
}

function evaluateLanguages(items: Language[]): SectionStatus {
  return items.some((l) => !l.language) ? "NEEDS_ATTENTION" : "LOOKS_GOOD"
}

function evaluateLocation(location: { city?: string; country?: string } | null): SectionStatus {
  return !location?.city && !location?.country ? "NEEDS_ATTENTION" : "LOOKS_GOOD"
}

export { evaluateExperience, evaluateEducation, evaluateSkills, evaluateCertifications, evaluateLanguages, evaluateLocation }
