export type DocumentType = "CV_RESUME" | "CERTIFICATE" | "LICENSE" | "DEGREE" | "OTHER"
export type DocumentStatus = "UPLOADED" | "PROCESSING" | "TEXT_EXTRACTED" | "READY" | "FAILED"
export type SectionStatus = "LOOKS_GOOD" | "NEEDS_ATTENTION"
export type SectionKey = "experience" | "education" | "skills" | "certifications" | "languages" | "location"

export type JobSeekerDocument = {
  id: string
  type: DocumentType
  name: string | null
  status: DocumentStatus
  processing_error: string | null
  storage_key: string
}

export type Experience = {
  id: string
  company: string
  title: string
  start_date: string | null
  end_date: string | null
  description: string | null
  technologies: string[]
}

export type Education = {
  id: string
  institution: string
  degree: string
  field: string | null
  start_date: string | null
  end_date: string | null
}

export type Certification = {
  id: string
  name: string
  issuer: string | null
  issue_date: string | null
  expiration_date: string | null
}

export type Language = {
  id: string
  language: string
  proficiency: string | null
}

export type FindingCategory = "missing_information" | "inconsistency" | "data_quality" | "cross_validation" | "credibility"

export type Finding = {
  category: FindingCategory
  sections: SectionKey[]
  title: string
  message: string
}

export type EvaluationStatuses = {
  experience: SectionStatus
  education: SectionStatus
  skills: SectionStatus
  certifications: SectionStatus
  languages: SectionStatus
  location: SectionStatus
}

// `profile.profile_evaluation` (persisted) carries findings; the bare
// `evaluation` returned alongside a fresh `profile` from analyze()/
// saveProfile() is just the statuses.
export type ProfileEvaluation = EvaluationStatuses & { findings: Finding[] }

export type JobSeekerProfile = {
  skills: string[]
  location: { city?: string; country?: string } | null
  experiences: Experience[]
  educations: Education[]
  certifications: Certification[]
  languages: Language[]
  profile_evaluation: ProfileEvaluation | null
}
