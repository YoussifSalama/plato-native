import type { Candidate } from '../apply/apply.types';

// The seeker's facts as compact text for the orchestrator: the ONLY source it may use to answer a form.
// No contact details beyond what a form asks for, capped so a huge profile stays cheap. The seeker's own earlier
// answers are included: a question answered once is never asked again.
export function profileSummary(c: Candidate, max = 4500): string {
  const line = (k: string, v: unknown) => (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) ? null : `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  const p = c.preferences;
  const out = [
    line('Name', c.fullName),
    line('Headline', c.headline),
    line('Location', c.location || c.country),
    line('Email', c.email),
    line('Phone', c.phone),
    line('Years of experience', c.totalYears ?? p.yearsExperience),
    line('Summary', c.summary),
    line('Skills', c.skills.slice(0, 40)),
    line('Links', Object.entries(c.links).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`)),
    line('Expected salary', p.salaryMin ? `${p.salaryMin}${p.salaryMax ? `-${p.salaryMax}` : ''} ${p.salaryCurrency ?? ''} per ${(p.salaryPeriod ?? 'month').toLowerCase()}` : null),
    line('Availability', p.availability),
    line('Work authorization', p.workAuthorization),
    line('Needs visa sponsorship', p.visaSponsorshipRequired ? 'yes' : 'no'),
    line('Willing to relocate', p.willingToRelocate ? 'yes' : 'no'),
    line('Languages', c.languages.map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`)),
    line('Certifications', c.certifications.map((x) => x.name)),
    ...c.experiences.slice(0, 8).map((e) => line('Experience', `${e.title} at ${e.company} (${e.start ?? '?'} to ${e.end ?? 'present'})${e.description ? `: ${e.description.slice(0, 350)}` : ''}`)),
    ...c.educations.slice(0, 4).map((e) => line('Education', `${e.degree}${e.field ? ` in ${e.field}` : ''}, ${e.institution}${e.start || e.end ? ` (${e.start?.slice(0, 4) ?? '?'} to ${e.end?.slice(0, 4) ?? 'present'})` : ''}`)),
    ...Object.entries(c.answerBank ?? {}).slice(-40).map(([q, v]) => line(`Answered before: "${q}"`, v)),
  ].filter(Boolean);
  return out.join('\n').slice(0, max);
}
