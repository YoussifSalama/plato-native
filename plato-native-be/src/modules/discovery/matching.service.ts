import { Injectable } from '@nestjs/common';
import BM25 from 'okapibm25';
import { PrismaService } from '../prisma/prisma.service';
import { JobSeekerSnapshot } from './job-seeker-snapshot';

const DEFAULT_SHORTLIST_SIZE = 1000;

// BM25's term-frequency lookup builds a RegExp straight out of the term
// string, so an unescaped skill like "C++" or "Node.js" throws at runtime.
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  // Layer 2: pure keyword/BM25 scoring — no AI here. Ranks every job
  // currently matched to this seeker against their skills/titles/experience
  // (via the same snapshot the query builder used) and shortlists the top
  // slice. A later AI layer re-ranks the shortlist.
  async rankMatches(
    jobSeekerId: string,
    snapshot: JobSeekerSnapshot,
    shortlistSize = DEFAULT_SHORTLIST_SIZE,
  ) {
    const matches = await this.prisma.jobSeekerJobMatch.findMany({
      where: { job_seeker_id: jobSeekerId },
      include: { job: true },
    });
    if (!matches.length) return { ranked: 0, shortlisted: 0 };

    const keywords = this.buildKeywords(snapshot);
    const documents = matches.map((m) =>
      [m.job.title, m.job.company, m.job.description ?? '']
        .join(' ')
        .toLowerCase(),
    );

    const scores = keywords.length
      ? (BM25(documents, keywords) as number[])
      : documents.map(() => 0);

    const ranked = matches
      .map((match, index) => ({ match, score: scores[index] }))
      .sort((a, b) => b.score - a.score);

    // Plain concurrent updates, not $transaction — this can be thousands of
    // rows and each write is independent, so there's no need to pay for
    // transactional atomicity (or risk hitting a transaction time limit).
    await Promise.all(
      ranked.map(({ match, score }, index) =>
        this.prisma.jobSeekerJobMatch.update({
          where: { id: match.id },
          data: { match_score: score, shortlisted: index < shortlistSize },
        }),
      ),
    );

    return {
      ranked: ranked.length,
      shortlisted: Math.min(shortlistSize, ranked.length),
    };
  }

  private buildKeywords(snapshot: JobSeekerSnapshot): string[] {
    const terms = [
      ...snapshot.skills,
      ...snapshot.roles,
      ...snapshot.experienceKeywords,
    ]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    return [...new Set(terms)].map(escapeRegExp);
  }
}
