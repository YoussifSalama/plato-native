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
    recordUsage({
      feature: 'discovery.apify',
      model: actorId,
      apify_usd: run.usageTotalUsd ?? 0,
    });
    const { items } = await this.client
      .dataset(run.defaultDatasetId)
      .listItems();
    return items as T[];
  }
}
