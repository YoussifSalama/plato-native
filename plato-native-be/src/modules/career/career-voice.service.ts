import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { IEnvParams } from '../../types/config/env.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeProfileService } from '../resume/resume-profile.service';
import { recordUsage } from '../usage/usage';
import { voiceCost } from '../usage/pricing';
import {
  planOf,
  toTokens,
  VOICE_USD_PER_MINUTE,
} from '../credits/credit-prices';
import { CreditsService } from '../credits/credits.service';
import { InsufficientTokensException } from '../credits/insufficient-tokens.exception';
import {
  profileBrief,
  VOICE_MAX_MINUTES,
  voiceInstructions,
} from './career-voice';
import {
  MIN_VOICE_WORDS,
  VoiceScorecard,
  voiceScorecardFor,
  voiceWords,
} from '../interview/interview';

export const voiceStartSchema = z.object({
  mode: z.enum(['practice', 'mock', 'skill']),
  skill: z.string().trim().max(60).optional(),
  // The job title they are preparing for.
  role: z.string().trim().max(80).optional(),
  jobDescription: z.string().trim().max(6000).optional(),
  // The practice format (behavioral, case, negotiation role-play...).
  focus: z.string().trim().max(300).optional(),
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
  // What the call was for, so the written scorecard judges it against the right role or job.
  context: z
    .object({
      title: z.string().trim().max(160),
      focus: z.string().trim().max(300).optional(),
      jobDescription: z.string().trim().max(6000).optional(),
    })
    .optional(),
});

// Why a finished call has no scorecard: nothing said, too little to judge, no tokens left
// for the scorer, or the scorer failed (the transcript is saved either way).
export type Unscored = 'empty' | 'short' | 'tokens' | 'failed';

// When the browser marked the call connected (voice/connected); null before.
const connectedAt = (h: { meta: unknown } | null) =>
  (h?.meta as { connected_at?: number } | null)?.connected_at ?? null;
// An unreported call's reservation is closed this long after its end (CreditsService.closeHold).
const HOLD_GRACE_MS = 5 * 60_000;

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
    // A new call in this conversation supersedes one that never reported back (a retry):
    // billed for its use if it connected, given back if it never did.
    for (
      let h = await this.credits.openHold(userId, 'career.voice', threadId);
      h && (await this.credits.closeHold(userId, h));
      h = await this.credits.openHold(userId, 'career.voice', threadId)
    );
    // The call is as long as the seeker's Plato tokens allow (up to the usual cap),
    // reserved now and atomically: two calls at once never take the same tokens.
    const acc = await this.credits.account(userId);
    const perMinute = toTokens(VOICE_USD_PER_MINUTE);
    const minutes = Math.min(
      VOICE_MAX_MINUTES,
      Math.floor(acc.balance / perMinute),
    );
    const holdId =
      minutes >= 1 &&
      (await this.credits.hold(
        userId,
        minutes * perMinute,
        'career.voice',
        { thread: threadId, minutes },
        minutes * 60_000 + HOLD_GRACE_MS,
      ));
    if (!holdId)
      throw new InsufficientTokensException(
        acc.balance,
        acc.period_end,
        perMinute,
        acc.unverified ? planOf('free').monthly : undefined,
      );
    try {
      return await this.openSession(seeker, req, minutes);
    } catch (e) {
      // our side failed (the key request, the network, the server): the call never ran, nothing is billed
      await this.credits.release(userId, holdId);
      throw e;
    }
  }

  private async openSession(
    seeker: { id: string; user: { full_name: string } },
    req: z.infer<typeof voiceStartSchema>,
    minutes: number,
  ) {
    const profile = await this.profiles.load(seeker.id);
    const instructions = voiceInstructions(req.mode, {
      firstName: seeker.user.full_name.split(' ')[0],
      brief: profileBrief(profile),
      skill: req.skill,
      role: req.role,
      jobDescription: req.jobDescription,
      focus: req.focus,
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
    // settled when the transcript arrives; on cancel or after the call's time, billed
    // only if the browser marked it connected (CreditsService.closeHold)
    return {
      clientSecret: body.value,
      model,
      instructions,
      maxSeconds: minutes * 60,
    };
  }

  /**
   * The browser's WebRTC call is live: sent once when it connects, then about
   * every 30 seconds. A call that is never reported is billed up to the last one.
   */
  async alive(userId: string, threadId: string) {
    await this.ownedThread(userId, threadId);
    const hold = await this.credits.openHold(userId, 'career.voice', threadId);
    return { ok: !!hold && (await this.credits.markAlive(userId, hold.id)) };
  }

  /**
   * The browser could not start the call (mic refused, connection failed) or left
   * before it went live. A call that never connected (voice/connected) is given
   * back in full; one that connected is billed like one that ended.
   */
  async cancel(userId: string, threadId: string) {
    await this.ownedThread(userId, threadId);
    const hold = await this.credits.openHold(userId, 'career.voice', threadId);
    if (!hold) return { released: false };
    if (!connectedAt(hold))
      return { released: await this.credits.release(userId, hold.id) };
    await this.settleVoice(userId, threadId, {
      mode: 'mock',
      seconds: 0,
      turns: [],
    });
    return { released: false };
  }

  // The call's transcript becomes ordinary messages in the Career chat, so the
  // text assistant and the shared memory see it.
  async saveTranscript(
    userId: string,
    threadId: string,
    body: z.infer<typeof voiceTranscriptSchema>,
  ) {
    const { thread } = await this.ownedThread(userId, threadId);
    // The balance before settling: the reservation is still taken out of it.
    const before = await this.credits.account(userId);
    // settled first: a call with nothing said still ran
    const settled = await this.settleVoice(userId, threadId, body);
    const saved = body.turns.length
      ? await this.saveTurns(threadId, thread.title, body)
      : 0;
    if (!body.turns.some((t) => t.role === 'user'))
      return this.noScore(saved, 'empty');
    if (voiceWords(body.turns) < MIN_VOICE_WORDS)
      return this.noScore(saved, 'short');
    // The scorer is a paid AI step: only with tokens left after the call's own charge.
    // The charge itself is recorded asynchronously, so it is worked out here, not re-read.
    if (before.balance + settled.heldTokens - settled.chargeTokens <= 0)
      return this.noScore(saved, 'tokens');
    let scorecard: VoiceScorecard | null = null;
    try {
      scorecard = await voiceScorecardFor(
        this.env.careerModel,
        {
          title: body.context?.title || LABEL[body.mode],
          focus: body.context?.focus,
          description: body.context?.jobDescription,
        },
        body.turns,
      );
    } catch (e) {
      this.logger.warn(
        `voice scorecard failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return this.noScore(saved, 'failed');
    }
    if (!scorecard) return this.noScore(saved, 'short');
    // Kept with the transcript, in the same conversation, so the text assistant sees it too.
    await this.prisma.careerMessage.create({
      data: {
        thread_id: threadId,
        role: ChatRole.ASSISTANT,
        content:
          `Scorecard for this voice interview: ${scorecard.overall}/100. ${[
            scorecard.strengths[0] && `Strength: ${scorecard.strengths[0]}`,
            scorecard.gaps[0] && `To work on: ${scorecard.gaps[0]}`,
          ]
            .filter(Boolean)
            .join('. ')}`.trim(),
        ui: {
          type: 'voice-scorecard',
          title: body.context?.title || LABEL[body.mode],
          scorecard,
        } as unknown as Prisma.InputJsonValue,
        created_at: new Date(Date.now() + body.turns.length + 2),
      },
    });
    return { saved, scorecard, unscored: null };
  }

  private noScore(saved: number, why: Unscored) {
    return { saved, scorecard: null, unscored: why };
  }

  private async saveTurns(
    threadId: string,
    title: string | null,
    body: z.infer<typeof voiceTranscriptSchema>,
  ) {
    const thread = { title };
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
    return body.turns.length;
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
    // from the moment the call connected, when the browser said so
    const seenSeconds = hold
      ? Math.min(
          reservedSeconds,
          (Date.now() - (connectedAt(hold) ?? hold.created_at.getTime())) /
            1000,
        )
      : body.seconds;
    const charge = Math.ceil(seenSeconds / 60) * VOICE_USD_PER_MINUTE;
    const u = body.usage;
    const reported = u ? voiceCost(this.env.realtimeModel, u) : null;
    const heldTokens = hold ? Math.max(0, -hold.amount) : 0;
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
        // the charge settles the reservation in the same write (CreditsService.charge)
        ...(hold && { hold: hold.id }),
        ...u,
      },
    });
    return { heldTokens, chargeTokens: toTokens(charge) };
  }
}
