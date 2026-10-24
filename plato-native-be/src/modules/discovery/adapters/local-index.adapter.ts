import { Injectable } from '@nestjs/common';
import { JobRemoteType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscoveryAdapter, DiscoveryQuery, NormalizedJob } from './types';
import { postedCutoff } from '../discovery-run.helpers';
import { inCountries } from '../countries';

// Every crawled posting already lives in `jobs`; that collection is our
// cache. Fresh postings that match the query come back instantly and reduce
// how much we ask Apify for.
// ponytail: Mongo regex over recent rows — swap for Atlas Search / Redis when the index is large.
export const INDEX_FRESHNESS_DAYS = 7;
const MAX_LOCAL = 300;

const ROLE_SUFFIX =
  /\s+(developer|engineer|programmer|specialist|lead|manager|analyst|designer|architect|consultant)$/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Full Stack Developer" → /full[\s-]*stack/i so hyphen/spacing variants match.
export function titlePattern(title: string): string {
  const stem = title.trim().replace(ROLE_SUFFIX, '').trim() || title.trim();
  return stem
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(escape)
    .join('[\\s-]*');
}

@Injectable()
export class LocalIndexAdapter implements DiscoveryAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async discover(query: DiscoveryQuery): Promise<NormalizedJob[]> {
    if (!query.titles.length) return [];
    const since = new Date(Date.now() - INDEX_FRESHNESS_DAYS * 86_400_000);

    const wantsRemote = query.remoteTypes.includes('remote');
    // Prisma's `contains` is a literal substring; regex needs the raw driver.
    const filter: Record<string, unknown> = {
      updated_at: { $gte: { $date: since.toISOString() } },
      posted_at: { $gte: { $date: postedCutoff().toISOString() } },
      // Found closed by the freshness check: not part of the index.
      expired_at: null,
      $or: query.titles.map((t) => ({
        title: { $regex: titlePattern(t), $options: 'i' },
      })),
    };
    if (query.locations.length && !query.willingToRelocate) {
      const near: Record<string, unknown>[] = query.locations.map((l) => ({
        location: { $regex: escape(l.split(',')[0].trim()), $options: 'i' },
      }));
      if (wantsRemote) near.push({ remote_type: JobRemoteType.REMOTE });
      filter.$and = [{ $or: near }];
    }

    const raw = (await this.prisma.job.findRaw({
      filter: filter as Prisma.InputJsonValue,
      options: {
        projection: { _id: 1 },
        sort: { updated_at: -1 },
        limit: MAX_LOCAL,
      },
    })) as unknown as { _id: { $oid: string } }[];
    const ids = raw.map((r) => r._id.$oid);
    if (!ids.length) return [];

    const rows = await this.prisma.job.findMany({ where: { id: { in: ids } } });
    // Country is a hard control (even when relocating); remote jobs pass.
    return rows
      .filter(
        (j) =>
          (wantsRemote && j.remote_type === JobRemoteType.REMOTE) ||
          inCountries(j.location, query.countries),
      )
      .map((j) => ({
        source: j.source,
        external_id: j.external_id,
        title: j.title,
        company: j.company,
        company_url: j.company_url,
        location: j.location,
        remote_type: j.remote_type,
        job_type: j.job_type,
        easy_apply: j.easy_apply,
        url: j.url,
        apply_url: j.apply_url,
        description: j.description,
        salary_min: j.salary_min,
        salary_max: j.salary_max,
        salary_currency: j.salary_currency,
        posted_at: j.posted_at,
        raw: j.raw ?? {},
      }));
  }
}
