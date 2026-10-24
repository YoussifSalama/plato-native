import { z } from 'zod';
import { sectionKeySchema } from './profile-extraction.schema';

const dateField = z.string().nullable().optional();

export const profileEditSchema = z.object({
  experiences: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      start_date: dateField,
      end_date: dateField,
      description: z.string().nullable().optional(),
      technologies: z.array(z.string()).optional(),
    }),
  ),
  educations: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string().nullable().optional(),
      start_date: dateField,
      end_date: dateField,
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string().nullable().optional(),
      issue_date: dateField,
      expiration_date: dateField,
    }),
  ),
  languages: z.array(
    z.object({
      language: z.string(),
      proficiency: z.string().nullable().optional(),
    }),
  ),
  skills: z.array(z.string()),
  location: z
    .object({ city: z.string().optional(), country: z.string().optional() })
    .nullable(),
  editedSections: z.array(sectionKeySchema),
});

export type ProfileEditInput = z.infer<typeof profileEditSchema>;
