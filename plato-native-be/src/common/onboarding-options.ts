import { z } from 'zod';
import onboardingOptions from './onboarding-options.json';

type OptionKey = Exclude<keyof typeof onboardingOptions, '_comment'>;

function valuesOf(key: OptionKey): [string, ...string[]] {
  const values = onboardingOptions[key].map((o) => o.value);
  return values as [string, ...string[]];
}

function enumOf(key: OptionKey) {
  return z.enum(valuesOf(key));
}

export { onboardingOptions };
export const seniorityEnum = enumOf('seniority');
export const jobTypeEnum = enumOf('jobTypes');
export const workModeEnum = enumOf('workModes');
export const industryEnum = enumOf('industries');
export const currencyEnum = enumOf('currencies');
export const availabilityEnum = enumOf('availability');
export const employmentStatusEnum = enumOf('employmentStatus');
export const yearsExperienceEnum = enumOf('yearsExperience');
export const alertFrequencyEnum = enumOf('alertFrequency');
