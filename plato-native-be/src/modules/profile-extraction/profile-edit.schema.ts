import { z } from 'zod';
import { sectionKeySchema } from './profile-extraction.schema';

// A date the seeker typed: empty clears it, anything else must parse.
const dateField = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .optional()
  .refine(
    (v) => !v || !Number.isNaN(new Date(v).getTime()),
    'Not a valid date',
  );
const text = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);
const optional = (max: number) =>
  z.string().trim().max(max).nullable().optional();
// End (or expiry) before start: refused, never saved.
const ordered = (from: string, to: string) => (v: Record<string, unknown>) =>
  !v[from] ||
  !v[to] ||
  new Date(v[from] as string) <= new Date(v[to] as string);

export const profileEditSchema = z.object({
  experiences: z
    .array(
      z
        .object({
          company: text(200, 'Add the company'),
          title: text(200, 'Add the job title'),
          start_date: dateField,
          end_date: dateField,
          description: z.string().max(5000).nullable().optional(),
          technologies: z.array(z.string().max(80)).max(60).optional(),
        })
        .refine(ordered('start_date', 'end_date'), {
          message: 'A job ends after it starts',
          path: ['end_date'],
        }),
    )
    .max(60),
  educations: z
    .array(
      z
        .object({
          institution: text(200, 'Add the school or university'),
          degree: z.string().trim().max(200),
          field: optional(200),
          start_date: dateField,
          end_date: dateField,
        })
        .refine(ordered('start_date', 'end_date'), {
          message: 'Studies end after they start',
          path: ['end_date'],
        }),
    )
    .max(30),
  certifications: z
    .array(
      z
        .object({
          name: text(200, 'Add the certification name'),
          issuer: optional(200),
          issue_date: dateField,
          expiration_date: dateField,
        })
        .refine(ordered('issue_date', 'expiration_date'), {
          message: 'A certification expires after it is issued',
          path: ['expiration_date'],
        }),
    )
    .max(60),
  languages: z
    .array(
      z.object({
        language: text(60, 'Add the language'),
        proficiency: optional(60),
      }),
    )
    .max(30),
  skills: z.array(z.string().trim().min(1).max(80)).max(200),
  location: z
    .object({
      city: z.string().trim().max(100).optional(),
      country: z.string().trim().max(100).optional(),
    })
    .nullable(),
  editedSections: z.array(sectionKeySchema),
});

export type ProfileEditInput = z.infer<typeof profileEditSchema>;
