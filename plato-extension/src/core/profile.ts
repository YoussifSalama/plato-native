import type { Profile } from '../dom/types';
import type { Candidate } from './types';

/** Identity details for the common-field mapper. Nothing else is taken from the candidate. */
export function profileFromCandidate(c: Candidate): Profile {
  const city = c.location.split(',')[0]?.trim();
  const keep = <T extends Record<string, string | null | undefined>>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Profile;
  return keep({
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    city,
    country: c.country,
    linkedin: c.links?.linkedin,
    github: c.links?.github,
    portfolio: c.links?.portfolio,
    currentCompany: c.currentCompany,
  });
}
