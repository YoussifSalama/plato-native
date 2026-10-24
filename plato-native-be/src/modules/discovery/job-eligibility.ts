import { excludesCountry, regionRestrictions } from '../apply/eligibility';
import { countryName, resolveCountry } from './countries';

// What the job card says about whether THIS seeker can take the job.
export interface JobEligibility {
  // open: stated region includes you. restricted: stated region leaves you out.
  // relocation: on-site in another country. unknown: nothing stated.
  status: 'open' | 'restricted' | 'relocation' | 'unknown';
  note: string;
}

interface JobText {
  title: string;
  description: string | null;
  location: string | null;
  remote_type: string;
}

// `countries`: lowercase names of where the seeker lives or can work.
export function jobEligibility(
  job: JobText,
  countries: string[],
): JobEligibility {
  const regions = regionRestrictions(`${job.title}\n${job.description ?? ''}`);
  if (regions.length) {
    const names = regions.map((r) => r.name).join(' or ');
    return excludesCountry(job, countries)
      ? {
          status: 'restricted',
          note: `Only takes applicants based in ${names}`,
        }
      : { status: 'open', note: `Open to applicants in ${names}` };
  }
  // An on-site or hybrid job in another country is not remote-eligible: say so.
  const where = job.location ? resolveCountry(job.location) : null;
  if (
    where &&
    job.remote_type !== 'REMOTE' &&
    countries.length &&
    !countries.includes(countryName(where).toLowerCase())
  )
    return {
      status: 'relocation',
      note: `${job.remote_type === 'HYBRID' ? 'Hybrid' : 'On-site'} in ${countryName(where)}: you would need to relocate`,
    };
  return { status: 'unknown', note: 'No location restriction stated' };
}
