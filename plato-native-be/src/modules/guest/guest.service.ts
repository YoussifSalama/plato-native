import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Guest, GuestSearch, Prisma } from '@prisma/client';
import { run } from '@openai/agents';
import { createHash, randomBytes } from 'crypto';
import { IEnvParams } from '../../types/config/env.types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { TextExtractionService } from '../documents/text-extraction.service';
import {
  CvAnalysis,
  CvAnalysisService,
  profileInputOf,
} from '../profile-extraction/cv-analysis.service';
import { createPreferenceSuggestionAgent } from '../preferences/preferences-suggestion.agent';
import type { PreferenceSuggestion } from '../preferences/preferences.schema';
import { JobSeekerDocumentService } from '../user/job-seeker-document.service';
import { JobSeekerDocumentVersionService } from '../user/job-seeker-document-version.service';
import { JobSeekerPreferenceService } from '../user/job-seeker-preference.service';
import { JobSeekerProfileService } from '../user/job-seeker-profile.service';
import { LinkedInAdapter } from '../discovery/adapters/linkedin.adapter';
import { DiscoveryQuery } from '../discovery/adapters/types';
import { countryName, resolveCountry } from '../discovery/countries';
import { fitsSearch, isFresh } from '../discovery/discovery-run.helpers';
import { DiscoveryService } from '../discovery/discovery.service';
import {
  buildJobSeekerSnapshot,
  residenceOf,
  type JobSeekerSnapshot,
} from '../discovery/job-seeker-snapshot';
import {
  matchKeywords,
  MatchingService,
  rankDocuments,
} from '../discovery/matching.service';
import { metered } from '../usage/usage';

/** Jobs a visitor sees before signing up. The rest never leave the server until the guest is claimed. */
export const GUEST_OPEN = 2;
const DAY = 86_400_000;
export const GUEST_TTL_MS = 7 * DAY;
// Each guest costs two AI reads of a CV and a paid LinkedIn (Apify) run, with no account behind them.
const GUESTS_PER_IP_PER_DAY = 3;
const CV_UPLOADS_PER_GUEST = 3;
const SEARCHES_PER_GUEST = 3;
const DAILY_MAX = Number(process.env.GUEST_SEARCH_DAILY_MAX ?? 300);
const BUDGET = 40; // about 40 LinkedIn jobs per search, whatever the roles and countries

export type GuestSearchInput = {
  roles: string[];
  countries: string[];
  remoteTypes: Array<'onsite' | 'hybrid' | 'remote'>;
  level: 'entry' | 'mid' | 'senior' | null;
};

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const levelOf = (s: string | null | undefined): GuestSearchInput['level'] =>
  !s
    ? null
    : s === 'internship' || s === 'entry'
      ? 'entry'
      : s === 'mid'
        ? 'mid'
        : 'senior';

/** What a visitor may see of an open job: no link, so applying goes through an account. */
const OPEN_SELECT = {
  id: true,
  title: true,
  company: true,
  location: true,
  remote_type: true,
  job_type: true,
  posted_at: true,
  salary_min: true,
  salary_max: true,
  salary_currency: true,
} satisfies Prisma.JobSelect;

/** The search profile a guest's CV gives, in the shape every search reads (as an account's snapshot would). */
export function guestSnapshot(
  analysis: CvAnalysis,
  suggestion: PreferenceSuggestion | null,
  input: GuestSearchInput,
): JobSeekerSnapshot {
  const exps = [...analysis.extraction.experience].sort((a, b) =>
    (b.start_date ?? '').localeCompare(a.start_date ?? ''),
  );
  return {
    skills: analysis.extraction.skills,
    roles: input.roles,
    preferredIndustries: suggestion?.industries ?? [],
    preferredLocations: input.countries.map((c) => countryName(c)),
    workSetup: input.remoteTypes,
    jobTypes: suggestion?.employment_types ?? [],
    experienceKeywords: [
      ...exps.map((e) => e.title),
      ...exps.flatMap((e) => e.technologies),
    ],
    yearsExperience: suggestion?.years_experience ?? null,
    seniority: input.level ?? suggestion?.seniority ?? null,
    experiences: exps.map((e) => ({
      title: e.title,
      technologies: e.technologies,
      description: e.description,
      start: e.start_date,
      end: e.end_date,
    })),
    willingToRelocate: false,
    visaSponsorshipRequired: false,
    residenceCountry: residenceOf(analysis.extraction.location),
    employmentStatus: null,
    salary: { min: null, currency: null, period: 'MONTHLY' },
  };
}

@Injectable()
export class GuestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GuestService.name);
  private readonly claiming = new Set<string>(); // ponytail: in-memory lock, one API instance (like discovery runs)
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly text: TextExtractionService,
    private readonly cvAnalysis: CvAnalysisService,
    private readonly linkedin: LinkedInAdapter,
    private readonly discovery: DiscoveryService,
    private readonly matching: MatchingService,
    private readonly documents: JobSeekerDocumentService,
    private readonly versions: JobSeekerDocumentVersionService,
    private readonly profiles: JobSeekerProfileService,
    private readonly preferences: JobSeekerPreferenceService,
  ) {}

  // A guest's CV is personal data held without an account: it goes after 7 days if never claimed.
  onModuleInit() {
    this.purgeTimer = setInterval(
      () => void this.purge().catch((e) => this.logger.warn(String(e))),
      60 * 60_000,
    );
    this.purgeTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.purgeTimer);
  }

  async purge(now = Date.now()) {
    const old = await this.prisma.guest.findMany({
      where: { created_at: { lt: new Date(now - GUEST_TTL_MS) } },
      select: { id: true, cv_storage_key: true },
    });
    for (const g of old) await this.remove(g, true);
    return old.length;
  }

  private async remove(
    g: Pick<Guest, 'id' | 'cv_storage_key'>,
    withFile: boolean,
  ) {
    if (withFile && g.cv_storage_key)
      await this.storage.delete(g.cv_storage_key).catch(() => undefined);
    await this.prisma.guest
      .delete({ where: { id: g.id } })
      .catch(() => undefined);
  }

  find(token: string | undefined) {
    return token
      ? this.prisma.guest.findUnique({
          where: { token_hash: hashToken(token) },
        })
      : Promise.resolve(null);
  }

  private async tooMany(where: Prisma.GuestWhereInput, limit: number) {
    return (await this.prisma.guest.count({ where })) >= limit;
  }

  /** A new guest for this device. The raw token goes in the cookie; only its hash is kept. */
  private async create(ip: string | undefined, userAgent: string | undefined) {
    const since = new Date(Date.now() - DAY);
    if (
      (ip &&
        (await this.tooMany(
          { ip, created_at: { gte: since } },
          GUESTS_PER_IP_PER_DAY,
        ))) ||
      (await this.tooMany({ created_at: { gte: since } }, DAILY_MAX))
    )
      throw new HttpException(
        'You have used your free searches for today. Create a free account to keep searching.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const token = randomBytes(32).toString('base64url');
    const guest = await this.prisma.guest.create({
      data: {
        token_hash: hashToken(token),
        ip: ip ?? null,
        user_agent: userAgent?.slice(0, 300) ?? null,
      },
    });
    return { token, guest };
  }

  /** Step 1: the CV. Read it, and from it suggest the search (roles, places, work setup, level). */
  async uploadCv(
    token: string | undefined,
    file: Express.Multer.File,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    let guest = await this.find(token);
    let newToken: string | null = null;
    if (!guest) ({ token: newToken, guest } = await this.create(ip, userAgent));
    if (guest.cv_uploads >= CV_UPLOADS_PER_GUEST)
      throw new HttpException(
        'Create a free account to upload another CV.',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    let cvText: string;
    try {
      cvText = await this.text.extract(file.buffer, file.mimetype);
    } catch {
      throw new BadRequestException(
        'Plato could not read that file. Try a PDF or Word copy of your CV.',
      );
    }
    if (cvText.trim().length < 200)
      throw new BadRequestException(
        'That file has almost no text. Upload your CV as a PDF or Word file (not a scan).',
      );
    await this.prisma.guest.update({
      where: { id: guest.id },
      data: { cv_uploads: { increment: 1 } },
    });

    const analysis = await this.cvAnalysis.analyze(cvText);
    const suggestion = await this.suggest(analysis).catch((e) => {
      this.logger.warn(`guest suggestion failed: ${String(e)}`);
      return null;
    });
    const key = await this.storage.upload(file, `guest-cvs/${guest.id}`);
    if (guest.cv_storage_key)
      await this.storage.delete(guest.cv_storage_key).catch(() => undefined);
    guest = await this.prisma.guest.update({
      where: { id: guest.id },
      data: {
        cv_storage_key: key,
        cv_name: file.originalname.slice(0, 200),
        cv_mime: file.mimetype,
        cv_text: cvText,
        analysis: analysis as unknown as Prisma.InputJsonValue,
        suggestion: suggestion ?? undefined,
      },
    });
    return { token: newToken, view: await this.view(guest) };
  }

  // The same suggestion onboarding makes from a confirmed profile.
  private async suggest(analysis: CvAnalysis) {
    const model = this.config.get<IEnvParams>('env')!.profileExtractionModel;
    const result = metered(
      'guest.preferences',
      model,
      await run(
        createPreferenceSuggestionAgent(model),
        JSON.stringify(analysis.extraction),
      ),
    );
    return result.finalOutput ?? null;
  }

  /** Everything the page needs to pick up where the visitor was: the CV, the suggested search, the latest search. */
  async view(guest: Guest) {
    const analysis = guest.analysis as unknown as CvAnalysis | null;
    const s = guest.suggestion as unknown as PreferenceSuggestion | null;
    const latest = await this.prisma.guestSearch.findFirst({
      where: { guest_id: guest.id },
      orderBy: { created_at: 'desc' },
    });
    const exp = analysis?.extraction.experience[0];
    return {
      cv: guest.cv_name ? { name: guest.cv_name } : null,
      profile: analysis
        ? {
            title: exp?.title ?? null,
            company: exp?.company ?? null,
            skills: analysis.extraction.skills.slice(0, 8),
            location: [
              analysis.extraction.location.city,
              analysis.extraction.location.country,
            ]
              .filter(Boolean)
              .join(', '),
          }
        : null,
      draft: analysis
        ? {
            roles: (s?.roles.length ? s.roles : exp ? [exp.title] : []).slice(
              0,
              2,
            ),
            countries: [
              ...new Set(
                [...(s?.locations ?? []), analysis.extraction.location.country]
                  .map((l) => (l ? resolveCountry(l) : null))
                  .filter((c): c is NonNullable<typeof c> => !!c),
              ),
            ].slice(0, 2),
            remoteTypes: (s?.work_setup ?? []).filter(
              (w): w is GuestSearchInput['remoteTypes'][number] =>
                w === 'remote' || w === 'hybrid' || w === 'onsite',
            ),
            level: levelOf(s?.seniority),
          }
        : null,
      search: latest ? await this.searchView(latest) : null,
      picked: guest.picked_job_ids,
    };
  }

  /** Step 2: the search, from the CV and what the visitor picked. LinkedIn only. */
  async startSearch(guest: Guest, input: GuestSearchInput) {
    const analysis = guest.analysis as unknown as CvAnalysis | null;
    if (!analysis) throw new ConflictException('Upload your CV first');
    const running = await this.prisma.guestSearch.findFirst({
      where: { guest_id: guest.id, status: 'RUNNING' },
    });
    if (running) return this.searchView(running);
    const [mine, today] = await Promise.all([
      this.prisma.guestSearch.count({ where: { guest_id: guest.id } }),
      this.prisma.guestSearch.count({
        where: { created_at: { gte: new Date(Date.now() - DAY) } },
      }),
    ]);
    if (mine >= SEARCHES_PER_GUEST || today >= DAILY_MAX)
      throw new HttpException(
        'Create a free account to keep searching.',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const snapshot = guestSnapshot(
      analysis,
      guest.suggestion as unknown as PreferenceSuggestion | null,
      input,
    );
    // The same query a signed-in search builds (titles planned from the CV), held to a small LinkedIn budget.
    const query: DiscoveryQuery = {
      ...(await this.discovery.queryFromSnapshot(snapshot, {
        titles: input.roles,
        countries: input.countries,
        ...(input.remoteTypes.length && { remoteTypes: input.remoteTypes }),
        ...(input.level && { level: input.level }),
      })),
      budget: BUDGET,
    };
    const row = await this.prisma.guestSearch.create({
      data: {
        guest_id: guest.id,
        query: query as unknown as Prisma.InputJsonValue,
      },
    });
    // ponytail: in-process fire-and-forget, like discovery runs; the page polls.
    void this.runSearch(row.id, query, snapshot);
    return this.searchView(row);
  }

  private async runSearch(
    id: string,
    query: DiscoveryQuery,
    snapshot: JobSeekerSnapshot,
  ) {
    try {
      const found = await this.linkedin.discover(query);
      const kept = found.filter((j) => isFresh(j) && fitsSearch(j, query));
      const ids = await this.discovery.indexJobIds(kept);
      // Best first against the CV, so the two open jobs are the strongest.
      const jobs = await this.prisma.job.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, company: true, description: true },
      });
      const order = rankDocuments(
        jobs.map((j) =>
          [j.title, j.company, j.description ?? ''].join(' ').toLowerCase(),
        ),
        matchKeywords(snapshot),
      );
      await this.prisma.guestSearch.update({
        where: { id },
        data: { status: 'DONE', job_ids: order.map((i) => jobs[i].id) },
      });
    } catch (err) {
      this.logger.error(`Guest search ${id} failed`, err);
      await this.prisma.guestSearch
        .update({
          where: { id },
          data: {
            status: 'FAILED',
            error: err instanceof Error ? err.message : String(err),
          },
        })
        .catch(() => undefined);
    }
  }

  searchOf(guestId: string, id: string) {
    return this.prisma.guestSearch.findFirst({
      where: { id, guest_id: guestId },
    });
  }

  /** Two open jobs, and only a count for the rest: no titles, no companies, no ids, nothing a page could unblur. */
  async searchView(row: GuestSearch) {
    const query = row.query as unknown as DiscoveryQuery;
    const base = {
      id: row.id,
      status: row.status,
      roles: query.requestedTitles ?? query.titles,
      countries: query.countries,
    };
    if (row.status !== 'DONE')
      return { ...base, total: 0, open: [], locked: 0 };
    const openIds = row.job_ids.slice(0, GUEST_OPEN);
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: openIds } },
      select: OPEN_SELECT,
    });
    const open = openIds.flatMap((jid) => jobs.filter((j) => j.id === jid));
    return {
      ...base,
      total: row.job_ids.length,
      open,
      locked: Math.max(0, row.job_ids.length - open.length),
    };
  }

  /** The open jobs the visitor ticked. Anything else is ignored. */
  async pick(guest: Guest, jobIds: string[]) {
    const latest = await this.prisma.guestSearch.findFirst({
      where: { guest_id: guest.id, status: 'DONE' },
      orderBy: { created_at: 'desc' },
    });
    const open = latest?.job_ids.slice(0, GUEST_OPEN) ?? [];
    const picked = jobIds.filter((id) => open.includes(id));
    await this.prisma.guest.update({
      where: { id: guest.id },
      data: { picked_job_ids: picked },
    });
    return { picked };
  }

  /**
   * After signup or login on the same device: the guest becomes the account's own. A new account takes the CV, the
   * profile read from it and the search choices as its preferences (so there is no onboarding to redo). An account
   * that already has a CV keeps its own profile and only gains the search. The guest row is then deleted.
   */
  async claim(token: string | undefined, jobSeekerId: string) {
    const guest = await this.find(token);
    if (!guest || this.claiming.has(guest.id)) return { threadId: null };
    this.claiming.add(guest.id);
    try {
      const analysis = guest.analysis as unknown as CvAnalysis | null;
      const latest = await this.prisma.guestSearch.findFirst({
        where: { guest_id: guest.id, status: 'DONE' },
        orderBy: { created_at: 'desc' },
      });
      const current = await this.versions.getCurrent(jobSeekerId);
      const hasCv = current
        ? (await this.documents.listByVersion(current.id)).some(
            (d) => d.type === 'CV_RESUME',
          )
        : false;

      const tookCv = !hasCv && !!analysis && !!guest.cv_storage_key;
      if (tookCv) {
        const version = await this.versions.getOrCreateCurrent(jobSeekerId);
        const doc = await this.documents.add(jobSeekerId, {
          type: 'CV_RESUME',
          url: guest.cv_storage_key!,
          name: guest.cv_name ?? 'CV',
          storage_key: guest.cv_storage_key!,
          document_version_id: version.id,
        });
        await this.documents.update(doc.id, {
          status: 'READY',
          extracted_text: guest.cv_text ?? '',
        });
        await this.profiles.replaceProfile(
          jobSeekerId,
          profileInputOf(analysis),
        );
        await this.versions.markAnalyzed(version.id);
        await this.preferences.upsert(
          jobSeekerId,
          this.preferencesOf(
            guest.suggestion as unknown as PreferenceSuggestion | null,
            latest?.query as unknown as DiscoveryQuery | undefined,
          ),
        );
      }

      const threadId = latest
        ? await this.moveSearch(jobSeekerId, latest, guest.picked_job_ids)
        : null;
      // The CV file now belongs to the account's document; otherwise it goes with the guest.
      await this.remove(guest, !tookCv);
      return { threadId };
    } finally {
      this.claiming.delete(guest.id);
    }
  }

  private preferencesOf(
    s: PreferenceSuggestion | null,
    q: DiscoveryQuery | undefined,
  ) {
    const requested = q?.requestedTitles ?? q?.titles ?? [];
    const remote = (q?.remoteTypes ?? []).filter((r) => r !== 'any');
    return {
      roles: requested.length ? requested : (s?.roles ?? []),
      preferred_locations: q?.countries.length
        ? q.countries.map((c) => countryName(c))
        : (s?.locations ?? []),
      work_setup: remote.length ? remote : (s?.work_setup ?? []),
      preferred_job_types: s?.employment_types ?? [],
      preferred_industries: s?.industries ?? [],
      salary_min: s?.salary_min ?? null,
      salary_max: s?.salary_max ?? null,
      salary_currency: s?.salary_currency ?? null,
      seniority: q?.level ?? s?.seniority ?? null,
      years_experience: s?.years_experience ?? null,
      // The visitor chose these on the public search: confirmed, so onboarding is not asked again.
      source: 'USER_CONFIRMED' as const,
    };
  }

  /** The guest search as a normal finished search on the account: a thread, a run, every job a match. */
  private async moveSearch(
    jobSeekerId: string,
    search: GuestSearch,
    picked: string[],
  ) {
    const { budget: _budget, ...query } =
      search.query as unknown as DiscoveryQuery;
    void _budget;
    const n = search.job_ids.length;
    const thread = await this.prisma.chatThread.create({
      data: {
        job_seeker_id: jobSeekerId,
        title:
          `${(query.requestedTitles ?? query.titles).slice(0, 2).join(', ')} search`.slice(
            0,
            60,
          ),
      },
    });
    const run = await this.prisma.discoveryRun.create({
      data: {
        job_seeker_id: jobSeekerId,
        thread_id: thread.id,
        status: 'DONE',
        query: query,
        progress: {
          stage: 'done',
          sources: { linkedin: { status: 'DONE', fetched: n } },
          merged: n,
          filtered: n,
          ranked: n,
        },
        fetched: n,
        matched: n,
        finished_at: new Date(),
      },
    });
    const now = new Date();
    for (const job_id of search.job_ids) {
      const save = picked.includes(job_id)
        ? { saved: true, saved_at: now }
        : {};
      await this.prisma.jobSeekerJobMatch.upsert({
        where: {
          job_seeker_id_job_id: { job_seeker_id: jobSeekerId, job_id },
        },
        create: {
          job_seeker_id: jobSeekerId,
          job_id,
          discovery_run_id: run.id,
          discovery_run_ids: [run.id],
          ...save,
        },
        update: {
          discovery_run_id: run.id,
          discovery_run_ids: { push: run.id },
          ...save,
        },
      });
    }
    await this.matching.rankMatches(
      jobSeekerId,
      await buildJobSeekerSnapshot(this.prisma, this.preferences, jobSeekerId),
    );
    return thread.id;
  }
}
