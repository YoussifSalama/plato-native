import { recordUsage } from '../usage/usage';
import { CareerVoiceService } from './career-voice.service';

// @nestjs/config ships as ESM, which this Jest setup does not load; the service only needs its type
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../usage/usage', () => ({ recordUsage: jest.fn() }));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

// CreditsService is injected: the reservation it finds and the release are stubbed here.
const credits = {
  openHold: jest.fn(),
  release: jest.fn().mockResolvedValue(true),
};
const releaseHold = credits.release;

function service(holds: { id: string; created_at: Date; meta: object }[]) {
  credits.openHold.mockImplementation(
    (_u: string, _f: string, thread: string) =>
      Promise.resolve(
        holds.find((h) => (h.meta as { thread?: string }).thread === thread) ??
          null,
      ),
  );
  const prisma = {
    jobSeeker: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 's1', user: { full_name: 'A B' } }),
    },
    careerThread: {
      findFirst: jest.fn().mockResolvedValue({ id: 't1', title: 'x' }),
      update: jest.fn(),
    },
    careerMessage: { createMany: jest.fn() },
  };
  const config = { get: () => ({ realtimeModel: 'gpt-realtime-mini' }) };
  return new CareerVoiceService(
    prisma as never,
    {} as never,
    config as never,
    credits as never,
  );
}
const charged = () => {
  const calls = (recordUsage as jest.Mock).mock.calls as [
    { cost_usd: number; meta: { server_seconds: number } },
  ][];
  return calls[calls.length - 1][0];
};
const turns = [{ role: 'user' as const, text: 'hi' }];
const bigUsage = {
  responses: 10,
  audioInputTokens: 5_000_000,
  audioOutputTokens: 5_000_000,
  textInputTokens: 0,
  textOutputTokens: 0,
  cachedInputTokens: 0,
};

beforeEach(() => jest.clearAllMocks());

describe('voice interview settlement', () => {
  it('releases the reservation and charges the browser-reported cost when it is under the ceiling', async () => {
    const svc = service([
      {
        id: 'h1',
        created_at: minutesAgo(5),
        meta: { thread: 't1', minutes: 10 },
      },
    ]);
    await svc.saveTranscript('u1', 't1', {
      mode: 'mock',
      seconds: 280,
      turns,
      usage: { ...bigUsage, audioInputTokens: 1000, audioOutputTokens: 1000 },
    });
    expect(releaseHold).toHaveBeenCalledWith('u1', 'h1');
    expect(charged().cost_usd).toBeCloseTo(0.03, 5); // 1000 x $10/M + 1000 x $20/M
  });

  it('a browser that inflates seconds or tokens pays at most the ceiling over the time the server saw', async () => {
    const svc = service([
      {
        id: 'h1',
        created_at: minutesAgo(2.5),
        meta: { thread: 't1', minutes: 10 },
      },
    ]);
    await svc.saveTranscript('u1', 't1', {
      mode: 'mock',
      seconds: 3600,
      turns,
      usage: bigUsage,
    });
    expect(charged().meta.server_seconds).toBeLessThanOrEqual(151);
    expect(charged().cost_usd).toBeCloseTo(0.3, 5); // 2.5 min seen -> 3 started minutes x $0.10, not 60 min
  });

  it('a browser that reports no usage pays the ceiling for the time, never more than reserved', async () => {
    const svc = service([
      {
        id: 'h1',
        created_at: minutesAgo(30),
        meta: { thread: 't1', minutes: 2 },
      },
    ]);
    await svc.saveTranscript('u1', 't1', {
      mode: 'practice',
      seconds: 900,
      turns,
    });
    expect(charged().cost_usd).toBeCloseTo(0.2, 5); // reserved 2 minutes
  });

  it('a call with nothing said is still settled', async () => {
    const svc = service([
      {
        id: 'h1',
        created_at: minutesAgo(1),
        meta: { thread: 't1', minutes: 5 },
      },
    ]);
    const r = await svc.saveTranscript('u1', 't1', {
      mode: 'practice',
      seconds: 20,
      turns: [],
    });
    expect(r).toEqual({ saved: 0 });
    expect(releaseHold).toHaveBeenCalledWith('u1', 'h1');
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('only the hold of this conversation is settled', async () => {
    const svc = service([
      {
        id: 'other',
        created_at: minutesAgo(1),
        meta: { thread: 't9', minutes: 5 },
      },
    ]);
    await svc.saveTranscript('u1', 't1', {
      mode: 'practice',
      seconds: 60,
      turns,
    });
    expect(releaseHold).not.toHaveBeenCalled();
  });
});
