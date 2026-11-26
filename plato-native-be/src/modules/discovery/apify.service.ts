import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApifyClient } from 'apify-client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { IEnvParams } from '../../types/config/env.types';
import { meteredUser, recordUsage } from '../usage/usage';
import { runCeiling } from '../credits/credit-prices';
import { CreditsService } from '../credits/credits.service';

// The search a run belongs to (set by DiscoveryService around its paid phase):
// it names the charges in the seeker's history and learns which actors the
// seeker's tokens could not cover.
export interface SearchRunContext {
  runId: string;
  label: string;
  ran: Set<string>;
  skipped: Set<string>;
}
export const searchRun = new AsyncLocalStorage<SearchRunContext>();

// How many results an input asks for: the boards name it limit, maxItems,
// maxResults, maxResultsPerTerm, maxJobs, max_results, limitPerSource (not maxPages).
export function resultLimit(input: Record<string, unknown>) {
  const asks = Object.entries(input)
    .filter(
      ([k, v]) =>
        /^(limit|max_?(results|items|jobs))/i.test(k) && typeof v === 'number',
    )
    .map(([, v]) => v as number);
  return asks.length ? Math.max(...asks) : 100;
}

// Apify caps memory for ALL runs on the account at once ("By launching this job
// you will exceed the memory limit..."). One search starts up to 8 LinkedIn runs
// plus the boards, so runs queue for a slot instead of failing.
// ponytail: in-process queue, fine for one API instance; raise with the Apify plan.
const MAX_CONCURRENT_RUNS = Math.max(
  1,
  Math.floor(Number(process.env.APIFY_MAX_CONCURRENT_RUNS) || 5),
);
const RUN_TIMEOUT_SECS = Math.max(
  30,
  Math.floor(Number(process.env.APIFY_RUN_TIMEOUT_SECS) || 180),
);

@Injectable()
export class ApifyService {
  private readonly logger = new Logger(ApifyService.name);
  private readonly client: ApifyClient;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  private async slot() {
    if (this.active < MAX_CONCURRENT_RUNS) this.active++;
    else await new Promise<void>((r) => this.waiting.push(r)); // slot handed over by release()
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }

  constructor(
    configService: ConfigService,
    @Optional() private readonly credits?: CreditsService,
  ) {
    const token = configService.get<IEnvParams>('env')!.apifyToken;
    this.client = new ApifyClient({ token });
  }

  async runActor<T>(
    actorId: string,
    input: Record<string, unknown>,
  ): Promise<T[]> {
    await this.slot();
    try {
      return await this.runNow<T>(actorId, input);
    } finally {
      this.release();
    }
  }

  // A paid run first reserves its worst case from the seeker's tokens, and is
  // skipped when that does not fit: a search (or two at once) never spends more
  // than the balance. Its charge settles the reservation (CreditsService.charge).
  private async reserve(actorId: string, input: Record<string, unknown>) {
    const userId = meteredUser();
    if (!userId || !this.credits) return { ok: true, hold: null, userId };
    const search = searchRun.getStore();
    try {
      const hold = await this.credits.hold(
        userId,
        runCeiling(actorId, resultLimit(input)),
        'discovery.apify',
        { actor: actorId, ...(search && { run: search.runId }) },
        (RUN_TIMEOUT_SECS + 600) * 1000,
      );
      return { ok: !!hold, hold, userId };
    } catch (e) {
      // metering must not break the search: on a credits error the run goes ahead unreserved
      this.logger.warn(`no reservation for ${actorId}: ${String(e)}`);
      return { ok: true, hold: null, userId };
    }
  }

  private async runNow<T>(
    actorId: string,
    input: Record<string, unknown>,
  ): Promise<T[]> {
    const search = searchRun.getStore();
    const { ok, hold, userId } = await this.reserve(actorId, input);
    if (!ok) {
      search?.skipped.add(actorId);
      this.logger.log(`${actorId} skipped: not enough Plato tokens`);
      return [];
    }
    search?.ran.add(actorId);
    // A run that hangs would hold its slot forever and freeze every search behind it:
    // Apify aborts it after RUN_TIMEOUT_SECS; what it already found is still read below.
    let results: number | null = null;
    const meta = () => ({
      ...(results !== null && { results }),
      ...(hold && { hold }),
      ...(search && { run: search.runId, thread: search.label }),
    });
    const run = await this.client
      .actor(actorId)
      .call(input, { timeout: RUN_TIMEOUT_SECS })
      .catch(async (e: unknown) => {
        // never started: the reservation goes back
        if (hold) await this.credits!.release(userId, hold).catch(() => false);
        throw e;
      });
    try {
      const { items } = await this.client
        .dataset(run.defaultDatasetId)
        .listItems();
      results = items.length;
      return items as T[];
    } finally {
      // recorded either way (Apify charged us); the seeker pays per result read,
      // so a run whose results could not be read costs the seeker nothing
      recordUsage({
        feature: 'discovery.apify',
        model: actorId,
        apify_usd: run.usageTotalUsd ?? 0,
        meta: meta(),
      });
    }
  }
}
