import { Injectable, Logger } from '@nestjs/common';
import { JobSource } from '@prisma/client';
import {
  BOARD_SOURCES,
  BoardSource,
  BoardsOutcome,
} from '../discovery-run.helpers';
import { ApifyService } from '../apify.service';
import { BoardDef, Country } from './boards/types';
import { marketScale, placeIn } from '../countries';
import { locationText } from './boards/util';
import { builtin } from './boards/builtin';
import { dice } from './boards/dice';
import { glassdoor } from './boards/glassdoor';
import { googleJobs } from './boards/google-jobs';
import { handshake } from './boards/handshake';
import { indeed } from './boards/indeed';
import { jobbank } from './boards/jobbank';
import { jobillico } from './boards/jobillico';
import { talent } from './boards/talent';
import { wuzzuf } from './boards/wuzzuf';
import { bayt } from './boards/bayt';
import { naukrigulf } from './boards/naukrigulf';
import { gulftalent } from './boards/gulftalent';
import { weworkremotely } from './boards/weworkremotely';
import { workingnomads } from './boards/workingnomads';
import { wellfound } from './boards/wellfound';
import { arc } from './boards/arc';
import { dynamitejobs } from './boards/dynamitejobs';
import { jobgether } from './boards/jobgether';
import { nodesk } from './boards/nodesk';
import { matchesQuery } from './open-feeds.adapter';
import { ziprecruiter } from './boards/ziprecruiter';
import { DiscoveryAdapter, DiscoveryQuery, NormalizedJob } from './types';

// Add a board = add its def here. Order is irrelevant; runs are parallel.
// DISABLED_BOARDS=WELLFOUND,WEWORKREMOTELY switches boards off without a deploy of code;
// BOARD:COUNTRY (GOOGLE_JOBS:EG) switches one board off in one market only.
// Read at plan time, so a test (or a changed env) sees its own value.
const offList = () =>
  new Set(
    (process.env.DISABLED_BOARDS ?? '')
      .split(',')
      .map((s) => s.replace(/\s+/g, '').toUpperCase())
      .filter(Boolean),
  );

export const BOARDS: BoardDef[] = [
  indeed,
  googleJobs,
  ziprecruiter,
  glassdoor,
  talent,
  jobbank,
  jobillico,
  dice,
  handshake,
  builtin,
  wuzzuf,
  bayt,
  naukrigulf,
  gulftalent,
  weworkremotely,
  workingnomads,
  wellfound,
  arc,
  dynamitejobs,
  jobgether,
  nodesk,
];

// Boards get a third of the remaining budget (LinkedIn and the ATS actor take
// the other two); one actor run per board × country × title.
const MAX_TITLES = 3;
const MAX_PER_RUN = 40;
// Every Apify run pays a container start (5-10s, and money) whatever it returns:
// fewer, fuller runs. A run never asks for fewer than this.
const MIN_PER_RUN = 10;
// Runs per search, all boards together. Every board in every market gets its best
// title first; second and third titles only while runs are left. BOARD_MAX_RUNS overrides.
// ponytail: fixed cap; per-board yield stats could pick which boards earn the extra titles.
const maxRuns = () =>
  Math.max(1, Math.floor(Number(process.env.BOARD_MAX_RUNS) || 16));
const DEFAULT_BUDGET = 200;
const REMOTE_MARKETS: Country[] = ['US', 'CA'];
// Marker country for boards that are not tied to one.
const ANYWHERE = 'ANY';

// Whatever a scraper returns, only clean scalars reach the database: a
// location object or an empty-string URL from one board must not break a run.
function clean(job: NormalizedJob): NormalizedJob {
  return {
    ...job,
    location: locationText(job.location),
    company_url: job.company_url || null,
    apply_url: job.apply_url || job.url,
    description: job.description || null,
    salary_currency: job.salary_currency || null,
  };
}

export interface BoardRun {
  board: BoardDef;
  country: Country;
  title: string;
}

@Injectable()
export class BoardsAdapter implements DiscoveryAdapter {
  private readonly logger = new Logger(BoardsAdapter.name);

  constructor(private readonly apify: ApifyService) {}

  // Markets to search: the seeker's countries. With none known, only
  // remote seekers search, in the big English-speaking remote markets.
  // ponytail: fixed list; make it a preference if remote seekers want more.
  private marketsFor(query: DiscoveryQuery): Country[] {
    // "us", "US" and a repeated "US" are one market.
    const countries = [
      ...new Set(query.countries.map((c) => c.trim().toUpperCase())),
    ].filter(Boolean);
    if (countries.length) return countries;
    return query.remoteTypes.includes('remote') ? REMOTE_MARKETS : [];
  }

  // board × country × title for this seeker, at most BOARD_MAX_RUNS; empty when
  // no market applies. Fair order under the cap:
  // - title by title: every market gets the best title before any gets a second;
  // - within a title, markets take turns (US, AE, EG, then each one's next board),
  //   so one market's many boards never crowd another market out;
  // - remote-work boards are one more market in that rotation.
  plan(query: DiscoveryQuery): BoardRun[] {
    const off = offList();
    const titles = query.titles
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_TITLES);
    const usable = BOARDS.filter((b) => !off.has(b.source));
    const lanes: { board: BoardDef; country: Country }[][] = this.marketsFor(
      query,
    ).map((country) =>
      usable
        .filter(
          (b) =>
            b.countries.includes(country) && !off.has(`${b.source}:${country}`),
        )
        .map((board) => ({ board, country })),
    );
    // Remote-work boards have no country: only for seekers who want remote.
    if (
      query.remoteTypes.includes('remote') ||
      query.remoteTypes.includes('any')
    )
      lanes.push(
        usable
          .filter((b) => b.anywhere)
          .map((board) => ({ board, country: ANYWHERE })),
      );
    // Round-robin across markets: each one's 1st board, then each one's 2nd...
    const pairs: { board: BoardDef; country: Country }[] = [];
    for (let k = 0; lanes.some((l) => k < l.length); k++)
      for (const lane of lanes) if (k < lane.length) pairs.push(lane[k]);
    const runs = titles.flatMap((title, i) =>
      pairs
        // Some remote boards ignore the keyword: one run is all they need.
        .filter(({ board }) => i === 0 || board.perTitle !== false)
        .map(({ board, country }) => ({ board, country, title })),
    );
    // More markets, more runs (marketScale): a third or fourth country must not take runs from the first two.
    return runs.slice(0, Math.round(maxRuns() * marketScale(query)));
  }

  // Which boards this run will search: the cards the seeker sees.
  sourcesFor(query: DiscoveryQuery): BoardSource[] {
    if (query.budget === 0) return [];
    const searched = new Set(this.plan(query).map((r) => r.board.source));
    return BOARD_SOURCES.filter((s) => searched.has(s));
  }

  async discover(query: DiscoveryQuery): Promise<NormalizedJob[]> {
    return (await this.discoverDetailed(query)).jobs;
  }

  async discoverDetailed(query: DiscoveryQuery): Promise<BoardsOutcome> {
    const plan = this.plan(query);
    if (!plan.length || query.budget === 0) return { jobs: [], failed: {} };

    const limit = Math.min(
      MAX_PER_RUN,
      Math.max(
        MIN_PER_RUN,
        Math.ceil((query.budget ?? DEFAULT_BUDGET) / 3 / plan.length),
      ),
    );
    const settled = await Promise.allSettled(
      plan.map(({ board, country, title }) =>
        this.run(board, country, title, limit, query),
      ),
    );

    // A board "failed" only when every one of its runs did.
    const runs = new Map<JobSource, { ok: number; error?: string }>();
    settled.forEach((r, i) => {
      const source = plan[i].board.source;
      const entry = runs.get(source) ?? { ok: 0 };
      if (r.status === 'fulfilled') entry.ok += 1;
      else {
        entry.error ??=
          r.reason instanceof Error
            ? r.reason.message
            : 'Unknown adapter error';
        this.logger.warn(
          `${source} ${plan[i].country} "${plan[i].title}" failed: ${String(r.reason)}`,
        );
      }
      runs.set(source, entry);
    });
    const failed: BoardsOutcome['failed'] = {};
    for (const [source, { ok, error }] of runs)
      if (!ok && error) failed[source] = error;

    if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;

    const seen = new Set<string>();
    const jobs = settled
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((j) => {
        const key = `${j.source}:${j.external_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { jobs, failed };
  }

  private async run(
    board: BoardDef,
    country: Country,
    title: string,
    limit: number,
    query: DiscoveryQuery,
  ) {
    const items = await this.apify.runActor<unknown>(
      board.actorId,
      board.input({
        title,
        location: country === ANYWHERE ? '' : placeIn(query, country),
        country,
        limit,
        query,
      }),
    );
    const countries = query.countries.map((c) => c.toUpperCase());
    const jobs = items
      .filter(
        (item) =>
          !board.accepts || !countries.length || board.accepts(item, countries),
      )
      .map((item) => board.map(item, country))
      .filter((j): j is NormalizedJob => j !== null)
      .map(clean);
    // Remote boards return what the actor found: keep the titles asked for, and drop
    // postings that only take applicants from elsewhere.
    return board.anywhere ? jobs.filter((j) => matchesQuery(j, query)) : jobs;
  }
}
