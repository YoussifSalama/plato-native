import { z } from 'zod';

export const SECTION_KEYS = [
  'experience',
  'education',
  'skills',
  'certifications',
  'languages',
  'location',
] as const;

export const sectionKeySchema = z.enum(SECTION_KEYS);
export type SectionKey = z.infer<typeof sectionKeySchema>;

export const findingSchema = z.object({
  category: z.enum([
    'missing_information',
    'inconsistency',
    'data_quality',
    'cross_validation',
    'credibility',
  ]),
  sections: z.array(sectionKeySchema).min(1),
  title: z.string(),
  message: z.string(),
});

export type Finding = z.infer<typeof findingSchema>;

export const extractionOutputSchema = z.object({
  location: z.object({
    city: z.string(),
    country: z.string(),
  }),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      description: z.string().nullable(),
      technologies: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
    }),
  ),
  skills: z.array(z.string()),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string().nullable(),
      issue_date: z.string().nullable(),
      expiration_date: z.string().nullable(),
    }),
  ),
  languages: z.array(
    z.object({
      language: z.string(),
      proficiency: z.string().nullable(),
    }),
  ),
  findings: z.array(findingSchema),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
