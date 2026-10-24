import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { run } from '@openai/agents';
import { IEnvParams } from '../../types/config/env.types';
import { createProfileExtractionAgent } from './profile-extraction.agent';
import { ExtractionOutput } from './profile-extraction.schema';
import { metered } from '../usage/usage';

@Injectable()
export class ProfileExtractionAgentService {
  constructor(private readonly configService: ConfigService) {}

  async extract(text: string): Promise<ExtractionOutput> {
    const model =
      this.configService.get<IEnvParams>('env')!.profileExtractionModel;
    const agent = createProfileExtractionAgent(model);
    const result = metered('onboarding.extract', model, await run(agent, text));
    if (!result.finalOutput) {
      throw new Error('Profile extraction agent returned no output');
    }
    return result.finalOutput;
  }
}
