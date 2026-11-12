import { Prisma } from '@prisma/client';

// The results search box: every word must appear somewhere in the job (title,
// company, place or description), in any order and any case. "react cairo"
// finds a React job in Cairo; the whole phrase never has to appear as typed.
// ponytail: regex scan per word, fine for one seeker's few thousand matches; a Mongo text index if it gets slow.
const FIELDS = ['title', 'company', 'location', 'description'] as const;

export function textWhere(q: string | undefined): Prisma.JobWhereInput[] {
  const words = (q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return words.map((w) => ({
    OR: FIELDS.map((f) => ({ [f]: { contains: w, mode: 'insensitive' } })),
  }));
}
