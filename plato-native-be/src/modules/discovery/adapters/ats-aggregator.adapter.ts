import { Injectable } from '@nestjs/common';
import { JobRemoteType, JobSource, Prisma } from '@prisma/client';
import { ApifyService } from '../apify.service';
import { expandTitle } from './title-expansion';
import { postedCutoff } from '../discovery-run.helpers';
import { searchPlaces } from '../countries';
import { DiscoveryAdapter, DiscoveryQuery, NormalizedJob } from './types';

// Apify actor: fantastic-jobs/career-site-job-listing-api.
// Empirically (see PLAN.md decisions): every search term is a hard filter,
// `timeRange: 7d` is too thin for smaller markets, and titles are phrase
// matched — so we backfill all active jobs and search title prefixes.
const ACTOR_ID = 'fantastic-jobs~career-site-job-listing-api';
const MAX_RESULTS = 200;
const MAX_REMOTE_RESULTS = 100;

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  freelance: 'CONTRACTOR',
  internship: 'INTERN',
  temporary: 'TEMPORARY',
  volunteer: 'VOLUNTEER',
};

const WORK_ARRANGEMENT_MAP: Record<'onsite' | 'hybrid' | 'remote', string[]> = {
  onsite: ['On-site'],
  hybrid: ['Hybrid'],
  remote: ['Remote OK', 'Remote Solely'],
};

// Our onboarding buckets (0-1, 1-3, 3-5, 5-10, 10+) don't line up 1:1 with
// the actor's (0-2, 2-5, 5-10, 10+) — nearest-fit approximation.
const EXPERIENCE_LEVEL_MAP: Record<string, string> = {
  '0-1': '0-2',
  '1-3': '2-5',
  '3-5': '2-5',
  '5-10': '5-10',
  '10+': '10+',
};

interface AtsJobItem {
  id: number | string;
  title: string;
  organization: string;
  organization_url?: string;
  url: string;
  source?: string;
  date_posted?: string;
  locations_derived?: string[];
  locations_alt?: string;
  ai_work_arrangement?: string;
  employment_type?: string[];
  ai_employment_type?: string[];
  ai_salary_min_value?: number;
  ai_salary_max_value?: number;
  ai_salary_currency?: string;
  description_text?: string;
}

function toRemoteType(arrangement: string | undefined): JobRemoteType {
  if (!arrangement) return JobRemoteType.UNKNOWN;
  if (arrangement.startsWith('Remote')) return JobRemoteType.REMOTE;
  if (arrangement === 'Hybrid') return JobRemoteType.HYBRID;
  if (arrangement === 'On-site') return JobRemoteType.ONSITE;
  return JobRemoteType.UNKNOWN;
}

const SOURCES: Record<string, JobSource> = {
  'lever.co': JobSource.LEVER,
  workable: JobSource.WORKABLE,
  greenhouse: JobSource.GREENHOUSE,
  ashby: JobSource.ASHBY,
};
function toSource(source: string | undefined): JobSource {
  return SOURCES[source ?? ''] ?? JobSource.WORKABLE;
}

@Injectable()
export class AtsAggregatorAdapter implements DiscoveryAdapter {
  constructor(private readonly apify: ApifyService) {}

  async discover(query: DiscoveryQuery): Promise<NormalizedJob[]> {
    // ponytail: env read directly; move to ConfigService if this grows.
    if (process.env.DISCOVERY_APIFY_ATS === 'false') return [];
    const base: Record<string, unknown> = {
      titleSearch: [...new Set(query.titles.flatMap(expandTitle))],
      // Workable has a public cross-company search (public-boards adapter);
      // the actor covers the ATSs that only publish per-company feeds.
      ats: ['lever.co', 'greenhouse', 'ashby'],
      timeRange: '6m',
      // Backfill everything active, but only postings inside the freshness window.
      datePostedAfter: postedCutoff().toISOString().slice(0, 10),
      descriptionType: 'text',
    };
    const employmentTypes = query.jobTypes
      .map((t) => EMPLOYMENT_TYPE_MAP[t])
      .filter((t): t is string => Boolean(t));
    if (employmentTypes.length) base.aiEmploymentTypeFilter = employmentTypes;
    if (query.yearsExperience && EXPERIENCE_LEVEL_MAP[query.yearsExperience]) {
      base.aiExperienceLevelFilter = [
        EXPERIENCE_LEVEL_MAP[query.yearsExperience],
      ];
    }
    if (query.visaSponsorshipRequired) base.aiVisaSponsorshipFilter = true;

    const workArrangements = new Set<string>();
    for (const type of query.remoteTypes) {
      if (type === 'any') continue;
      WORK_ARRANGEMENT_MAP[type].forEach((v) => workArrangements.add(v));
    }
    const wantsRemote = workArrangements.has('Remote OK');

    if (query.budget === 0) return [];
    // The other half of the remaining budget comes from the ATS actor.
    const limit =
      query.budget === undefined
        ? MAX_RESULTS
        : Math.min(MAX_RESULTS, Math.max(10, Math.ceil(query.budget / 2)));

    // Query 1: jobs where the seeker lives (any arrangement they accept).
    const local: Record<string, unknown> = { ...base, limit };
    // locationSearch is a hard include-filter: the seeker's places, or (when
    // willing to relocate) every place inside the countries they chose.
    const places = searchPlaces(query);
    if (places.length) local.locationSearch = places;
    if (workArrangements.size)
      local.aiWorkArrangementFilter = [...workArrangements];

    const calls = [this.apify.runActor<AtsJobItem>(ACTOR_ID, local)];
    // Query 2: remote roles anywhere — a location filter would hide them.
    if (wantsRemote && local.locationSearch) {
      calls.push(
        this.apify.runActor<AtsJobItem>(ACTOR_ID, {
          ...base,
          limit: Math.min(MAX_REMOTE_RESULTS, limit),
          aiWorkArrangementFilter: WORK_ARRANGEMENT_MAP.remote,
        }),
      );
    }

    const items = (await Promise.all(calls)).flat();
    const seen = new Set<string>();
    return items
      .filter((item) => {
        const key = String(item.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => this.normalize(item));
  }

  private normalize(item: AtsJobItem): NormalizedJob {
    const location = item.locations_derived?.[0] ?? item.locations_alt ?? null;

    return {
      source: toSource(item.source),
      external_id: String(item.id),
      title: item.title,
      company: item.organization,
      company_url: item.organization_url ?? null,
      location,
      remote_type: toRemoteType(item.ai_work_arrangement),
      job_type:
        item.employment_type?.[0] ?? item.ai_employment_type?.[0] ?? null,
      easy_apply: true,
      url: item.url,
      apply_url: item.url,
      description: item.description_text ?? null,
      salary_min: item.ai_salary_min_value ?? null,
      salary_max: item.ai_salary_max_value ?? null,
      salary_currency: item.ai_salary_currency ?? null,
      posted_at: item.date_posted ? new Date(item.date_posted) : null,
      raw: item as unknown as Prisma.InputJsonValue,
    };
  }
}
