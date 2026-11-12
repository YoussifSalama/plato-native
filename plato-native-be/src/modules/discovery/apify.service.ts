import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApifyClient } from 'apify-client';
import { IEnvParams } from '../../types/config/env.types';
import { recordUsage } from '../usage/usage';

// Apify caps memory for ALL runs on the account at once ("By launching this job
// you will exceed the memory limit..."). One search starts up to 8 LinkedIn runs
// plus the boards, so runs queue for a slot instead of failing.
// ponytail: in-process queue, fine for one API instance; raise with the Apify plan.
const MAX_CONCURRENT_RUNS = Number(process.env.APIFY_MAX_CONCURRENT_RUNS ?? 3);

@Injectable()
export class ApifyService {
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

  constructor(configService: ConfigService) {
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

  private async runNow<T>(
    actorId: string,
    input: Record<string, unknown>,
  ): Promise<T[]> {
    const run = await this.client.actor(actorId).call(input);
    let results: number | null = null;
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
        ...(results !== null && { meta: { results } }),
      });
    }
  }
}
