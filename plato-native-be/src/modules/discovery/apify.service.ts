import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApifyClient } from 'apify-client';
import { IEnvParams } from '../../types/config/env.types';
import { recordUsage } from '../usage/usage';

@Injectable()
export class ApifyService {
  private readonly client: ApifyClient;

  constructor(configService: ConfigService) {
    const token = configService.get<IEnvParams>('env')!.apifyToken;
    this.client = new ApifyClient({ token });
  }

  async runActor<T>(
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
