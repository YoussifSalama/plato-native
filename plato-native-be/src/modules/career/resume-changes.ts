import type { ResumeDoc, ResumeProfile } from '../resume/resume.types';

// "What Plato changed" on the review screen (owner screen 07): a tailored resume
// compared with the seeker's own profile. Computed, never written by the model.
export interface ResumeChange {
  section: 'summary' | 'experience' | 'keywords';
  before: string | null;
  after: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function resumeChanges(
  profile: Pick<ResumeProfile, 'summary' | 'skills' | 'experiences'>,
  doc: Pick<ResumeDoc, 'summary' | 'experiences'>,
  ats: { matched: string[] } | null,
): ResumeChange[] {
  const out: ResumeChange[] = [];
  if (doc.summary && norm(doc.summary) !== norm(profile.summary ?? ''))
    out.push({
      section: 'summary',
      before: profile.summary || null,
      after: doc.summary,
    });

  const first = doc.experiences[0];
  const was = profile.experiences[0];
  if (
    first &&
    was &&
    (norm(first.company) !== norm(was.company) ||
      norm(first.title) !== norm(was.title))
  )
    out.push({
      section: 'experience',
      before: null,
      after: `Moved your ${first.title} work at ${first.company} to the top: it is the closest to this job.`,
    });

  const own = norm(
    [
      profile.summary,
      ...profile.skills,
      ...profile.experiences.map(
        (e) => `${e.title} ${e.description ?? ''} ${e.technologies.join(' ')}`,
      ),
    ].join(' '),
  );
  const added = (ats?.matched ?? [])
    .filter((k) => !own.includes(norm(k)))
    .slice(0, 6);
  if (added.length)
    out.push({
      section: 'keywords',
      before: null,
      after: `Added: ${added.join(', ')}.`,
    });
  return out;
}
