import { z } from 'zod';
import { ResumeDoc } from './resume.types';

// What the seeker may change by hand in the review screen: wording only.
// Employers, titles, dates and education come from the profile and are not
// editable here (change them in Profile).
const line = z.string().trim().min(1).max(300);
export const docEditsSchema = z.object({
  headline: z.string().trim().max(80).optional(),
  summary: z.string().trim().max(700).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
  // Aligned by index with doc.experiences / doc.projects.
  experiences: z
    .array(z.object({ bullets: z.array(line).max(8) }))
    .max(30)
    .optional(),
  projects: z
    .array(z.object({ bullets: z.array(line).max(8) }))
    .max(30)
    .optional(),
});
export type DocEdits = z.infer<typeof docEditsSchema>;

export function applyEdits(doc: ResumeDoc, e: DocEdits): ResumeDoc {
  const merge = <T extends { bullets: string[] }>(
    list: T[],
    edits?: { bullets: string[] }[],
  ) =>
    edits
      ? list.map((x, i) => (edits[i] ? { ...x, bullets: edits[i].bullets } : x))
      : list;
  return {
    ...doc,
    headline: e.headline ?? doc.headline,
    summary: e.summary ?? doc.summary,
    skills: e.skills ?? doc.skills,
    experiences: merge(doc.experiences, e.experiences),
    projects: merge(doc.projects, e.projects),
  };
}
