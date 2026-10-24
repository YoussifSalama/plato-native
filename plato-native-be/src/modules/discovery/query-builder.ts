import { BadRequestException } from '@nestjs/common';
import { onboardingOptions } from '../../common/onboarding-options';
import { DiscoveryQuery } from './adapters/types';
import { JobSeekerSnapshot } from './job-seeker-snapshot';
import { countriesOf } from './countries';

const LOCATION_LABELS = new Map(
  onboardingOptions.locations.map((o) => [o.value, o.label]),
);

// Onboarding's "Remote — X" pseudo-locations aren't real places to search
// by — they only ever mean "remote work_setup", which we already read
// separately from preferences.work_setup.
function isRemotePseudoLocation(value: string): boolean {
  return value.startsWith('remote_');
}

function resolveLocationLabel(value: string): string {
  return LOCATION_LABELS.get(value) ?? value;
}

export function buildDiscoveryQuery(
  snapshot: JobSeekerSnapshot,
): DiscoveryQuery {
  const titles = [
    ...new Set(snapshot.roles.map((r) => r.trim()).filter(Boolean)),
  ];
  if (!titles.length) {
    throw new BadRequestException(
      'Set at least one desired job title before discovering jobs',
    );
  }

  const locations = [
    ...new Set(
      snapshot.preferredLocations
        .filter((l) => !isRemotePseudoLocation(l))
        .map(resolveLocationLabel),
    ),
  ];

  const remoteTypes = snapshot.workSetup.filter(
    (w): w is 'onsite' | 'hybrid' | 'remote' | 'any' =>
      ['onsite', 'hybrid', 'remote', 'any'].includes(w),
  );

  return {
    titles,
    locations,
    countries: countriesOf(
      locations,
      snapshot.preferredLocations.filter(isRemotePseudoLocation),
    ),
    remoteTypes,
    jobTypes: [...new Set(snapshot.jobTypes)],
    industries: [...new Set(snapshot.preferredIndustries)],
    yearsExperience: snapshot.yearsExperience,
    willingToRelocate: snapshot.willingToRelocate,
    visaSponsorshipRequired: snapshot.visaSponsorshipRequired,
  };
}
