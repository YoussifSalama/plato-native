import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { run, type AgentInputItem } from '@openai/agents';
import { IEnvParams } from '../../types/config/env.types';
import { JobSeekerService } from '../user/job-seeker.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { RankingAgentContext } from '../discovery/agent/ranking-agent.context';
import { createChatAgent } from './chat.agent';
import { ChatMessage } from './chat.schema';
import { metered } from '../usage/usage';

function toAgentInput(messages: ChatMessage[]): AgentInputItem[] {
  return messages.map((m) =>
    m.role === 'user'
      ? { role: 'user' as const, content: m.content }
      : {
          role: 'assistant' as const,
          status: 'completed' as const,
          content: [{ type: 'output_text' as const, text: m.content }],
        },
  );
}

@Injectable()
export class ChatService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jobSeekerService: JobSeekerService,
    private readonly discoveryService: DiscoveryService,
  ) {}

  async reply(
    messages: ChatMessage[],
    userId: string,
    stage?: number,
  ): Promise<string> {
    const model = this.configService.get<IEnvParams>('env')!.chatModel;
    const agent = createChatAgent(model, stage);
    const context: RankingAgentContext = {
      userId,
      jobSeekerService: this.jobSeekerService,
      discoveryService: this.discoveryService,
    };
    const result = metered(
      'chat.onboarding',
      model,
      await run(agent, toAgentInput(messages), { context }),
    );
    if (typeof result.finalOutput !== 'string') {
      throw new Error('Chat agent returned no text output');
    }
    return result.finalOutput;
  }
}
