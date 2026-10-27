import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRole } from '@prisma/client';
import { z } from 'zod';
import { IEnvParams } from '../../types/config/env.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeProfileService } from '../resume/resume-profile.service';
import { recordUsage } from '../usage/usage';
import { voiceCost } from '../usage/pricing';
import { toTokens, VOICE_USD_PER_MINUTE } from '../credits/credit-prices';
import { CreditsService } from '../credits/credits.service';
import { InsufficientTokensException } from '../credits/insufficient-tokens.exception';
import {
  profileBrief,
  VOICE_MAX_MINUTES,
  voiceInstructions,
} from './career-voice';

export const voiceStartSchema = z.object({
  mode: z.enum(['practice', 'mock', 'skill']),
  skill: z.string().trim().max(60).optional(),
  // The job title they are preparing for.
  role: z.string().trim().max(80).optional(),
  jobDescription: z.string().trim().max(6000).optional(),
});

export const voiceTranscriptSchema = z.object({
  mode: z.enum(['practice', 'mock', 'skill']),
  seconds: z.number().int().min(0).max(3600),
  turns: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .max(200),
  // As reported by the browser session; used for cost tracking only.
  // Summed from the call's `response.done` events; the audio/text split is what is billed.
  usage: z
    .object({
      responses: z.number().int().min(0).max(2000),
      audioInputTokens: z.number().int().min(0).max(5_000_000),
      audioOutputTokens: z.number().int().min(0).max(5_000_000),
      textInputTokens: z.number().int().min(0).max(5_000_000),
      textOutputTokens: z.number().int().min(0).max(5_000_000),
      cachedInputTokens: z.number().int().min(0).max(5_000_000),
    })
    .optional(),
});

const LABEL = {
  practice: 'Practice interview',
  mock: 'Mock interview',
  skill: 'Skill proof',
} as const;

// Voice interviews run browser <-> OpenAI over WebRTC: audio never touches this
// server. We only hand the browser a short-lived key and a fixed prompt, then
// store the transcript afterwards.
@Injectable()
export class CareerVoiceService {
  private readonly logger = new Logger(CareerVoiceService.name);
  private readonly env: IEnvParams;

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ResumeProfileService,
    config: ConfigService,
    private readonly credits: CreditsService,
  ) {
    this.env = config.get<IEnvParams>('env')!;
  }

  private async ownedThread(userId: string, threadId: string) {
    const seeker = await this.prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      include: { user: { select: { full_name: true } } },
    });
    const thread =
      seeker &&
      (await this.prisma.careerThread.findFirst({
        where: { id: threadId, job_seeker_id: seeker.id },
      }));
    if (!seeker || !thread)
      throw new NotFoundException('Conversation not found');
    return { seeker, thread };
  }

  async start(
    userId: string,
    threadId: string,
    req: z.infer<typeof voiceStartSchema>,
  ) {
    const { seeker } = await this.ownedThread(userId, threadId);
    // The call is as long as the seeker's Plato tokens allow (up to the usual cap).
    const acc = await this.credits.account(userId);
    const perMinute = toTokens(VOICE_USD_PER_MINUTE);
    const minutes = Math.min(
      VOICE_MAX_MINUTES,
      Math.floor(acc.balance / perMinute),
    );
    if (minutes < 1)
      throw new InsufficientTokensException(
        acc.balance,
        acc.period_end,
        perMinute,
      );
    const profile = await this.profiles.load(seeker.id);
    const instructions = voiceInstructions(req.mode, {
      firstName: seeker.user.full_name.split(' ')[0],
      brief: profileBrief(profile),
      skill: req.skill,
      role: req.role,
      jobDescription: req.jobDescription,
    });
    const model = this.env.realtimeModel;
    const res = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // The key only has to live long enough to open the call.
          expires_after: { anchor: 'created_at', seconds: 120 },
          session: {
            type: 'realtime',
            model,
            instructions,
            audio: {
              input: { transcription: { model: 'gpt-4o-mini-transcribe' } },
              output: { voice: 'marin' },
            },
          },
        }),
      },
    );
    const body = (await res.json().catch(() => null)) as {
      value?: string;
      expires_at?: number;
    } | null;
    if (!res.ok || !body?.value) {
      this.logger.warn(`Realtime key failed: ${res.status}`);
      throw new BadGatewayException('Could not start the voice interview.');
    }
    // reserved now, settled when the transcript arrives; a call that never
    // reports back keeps its reservation
    await this.credits.hold(userId, minutes * perMinute, 'career.voice', {
      thread: threadId,
      minutes,
    });
    return {
      clientSecret: body.value,
      model,
      instructions,
      maxSeconds: minutes * 60,
    };
  }

  // The call's transcript becomes ordinary messages in the Career chat, so the
  // text assistant and the shared memory see it.
  async saveTranscript(
    userId: string,
    threadId: string,
    body: z.infer<typeof voiceTranscriptSchema>,
  ) {
    const { thread } = await this.ownedThread(userId, threadId);
    // settled first: a call with nothing said still ran
    await this.settleVoice(userId, threadId, body);
    if (!body.turns.length) return { saved: 0 };
    const minutes = Math.max(1, Math.round(body.seconds / 60));
    // Distinct, increasing timestamps keep the order stable.
    const t0 = Date.now();
    await this.prisma.careerMessage.createMany({
      data: [
        {
          thread_id: threadId,
          role: ChatRole.ASSISTANT,
          content: `Voice session: ${LABEL[body.mode]}, ${minutes} min. The transcript follows.`,
          created_at: new Date(t0),
        },
        ...body.turns.map((t, i) => ({
          thread_id: threadId,
          role: t.role === 'user' ? ChatRole.USER : ChatRole.ASSISTANT,
          content: t.text,
          created_at: new Date(t0 + i + 1),
        })),
      ],
    });
    await this.prisma.careerThread.update({
      where: { id: threadId },
      data: {
        updated_at: new Date(),
        ...(thread.title === 'New conversation' && {
          title: `${LABEL[body.mode]} (voice)`,
        }),
      },
    });
    // Usage and cost are stored for us only; the client is never told.
    return { saved: body.turns.length };
  }

  // The browser reports the call's length and tokens, so neither decides the
  // charge: a client could send zeros. The call is billed per started minute of
  // the time the server saw (from the reservation to the transcript, which the
  // browser posts as the call ends), never above what was reserved. What the
  // browser reported is kept for our cost tracking only.
  private async settleVoice(
    userId: string,
    threadId: string,
    body: z.infer<typeof voiceTranscriptSchema>,
  ) {
    const hold = await this.credits.openHold(userId, 'career.voice', threadId);
    const reservedSeconds =
      ((hold?.meta as { minutes?: number } | null)?.minutes ?? 0) * 60;
    const seenSeconds = hold
      ? Math.min(
          reservedSeconds,
          (Date.now() - hold.created_at.getTime()) / 1000,
        )
      : body.seconds;
    const charge = Math.ceil(seenSeconds / 60) * VOICE_USD_PER_MINUTE;
    const u = body.usage;
    const reported = u ? voiceCost(this.env.realtimeModel, u) : null;
    if (hold) await this.credits.release(userId, hold.id);
    recordUsage({
      feature: 'career.voice',
      model: this.env.realtimeModel,
      input_tokens: u ? u.audioInputTokens + u.textInputTokens : 0,
      output_tokens: u ? u.audioOutputTokens + u.textOutputTokens : 0,
      cost_usd: charge,
      meta: {
        mode: body.mode,
        seconds: body.seconds,
        server_seconds: Math.round(seenSeconds),
        reported_usd: reported,
        turns: body.turns.length,
        ...u,
      },
    });
  }
}
