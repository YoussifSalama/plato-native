import { recordUsage } from '../usage/usage';
import { CareerVoiceService } from './career-voice.service';
import { voiceScorecardFor } from '../interview/interview';

// @nestjs/config ships as ESM, which this Jest setup does not load; the service only needs its type
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../usage/usage', () => ({ recordUsage: jest.fn() }));
// The scorer is an AI call: stubbed, and checked for when it may run.
jest.mock('../interview/interview', () => {
  const actual = jest.requireActual<typeof import('../interview/interview')>(
    '../interview/interview',
  );
  return { ...actual, voiceScorecardFor: jest.fn() };
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

// CreditsService is injected: the reservation it finds and the release are stubbed here.
const credits = {
  account: jest.fn().mockResolvedValue({ balance: 500 }),
  openHold: jest.fn(),
  release: jest.fn().mockResolvedValue(true),
};
const releaseHold = credits.release;

let prisma: {
  careerMessage: { createMany: jest.Mock; create: jest.Mock };
};
function service(
  holds: { id: string; created_at: Date; meta: object; amount?: number }[],
) {
  credits.openHold.mockImplementation(
    (_u: string, _f: string, thread: string) =>
      Promise.resolve(
        holds.find((h) => (h.meta as { thread?: string }).thread === thread) ??
          null,
      ),
  );
  prisma = {
    jobSeeker: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 's1', user: { full_name: 'A B' } }),
    },
    careerThread: {
      findFirst: jest.fn().mockResolvedValue({ id: 't1', title: 'x' }),
      update: jest.fn(),
    },
    careerMessage: { createMany: jest.fn(), create: jest.fn() },
  } as never;
  const config = {
    get: () => ({ realtimeModel: 'gpt-realtime-mini', careerModel: 'm' }),
  };
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

beforeEach(() => {
  jest.clearAllMocks();
  credits.account.mockResolvedValue({ balance: 500 });
});

describe('voice interview settlement', () => {
  it('releases the reservation and charges per started minute the server saw, not the browser-reported cost', async () => {
    const svc = service([
      {
        id: 'h1',
        created_at: minutesAgo(4.5),
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
    expect(charged().cost_usd).toBeCloseTo(0.5, 5); // 4.5 minutes -> 5 started minutes x $0.10
  });

  it('a browser that reports zero seconds and zero usage still pays for the time the server saw', async () => {
    const svc = service([
      {
        id: 'h1',
        created_at: minutesAgo(15),
        meta: { thread: 't1', minutes: 15 },
      },
    ]);
    await svc.saveTranscript('u1', 't1', {
      mode: 'mock',
      seconds: 0,
      turns: [],
      usage: { ...bigUsage, audioInputTokens: 0, audioOutputTokens: 0 },
    });
    expect(charged().cost_usd).toBeCloseTo(1.5, 5); // 15 minutes x $0.10
  });

  it('a browser that inflates seconds or tokens pays only for the time the server saw', async () => {
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

  it('never more than reserved', async () => {
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
    expect(r).toEqual({ saved: 0, scorecard: null, unscored: 'empty' });
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

describe('voice interview scorecard', () => {
  const answer = (n: number) =>
    Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  const talk = [
    { role: 'assistant' as const, text: 'Tell me about a project you led.' },
    { role: 'user' as const, text: answer(40) },
  ];
  const card = {
    questions: [
      { index: 0, question: 'q', answer: 'a', score: 4, feedback: 'f' },
    ],
    communication: { score: 4, note: 'n' },
    strengths: ['clear'],
    gaps: ['numbers'],
    nextSteps: [],
    overall: 75,
  };
  const hold = (minutes: number, ago: number) => ({
    id: 'h1',
    created_at: minutesAgo(ago),
    meta: { thread: 't1', minutes },
    amount: -minutes * 100, // 100 tokens a minute ($0.10 at $0.001 a token)
  });

  it('scores the call after settling it, stores the scorecard with the transcript and returns it', async () => {
    (voiceScorecardFor as jest.Mock).mockResolvedValue(card);
    const svc = service([hold(10, 3)]);
    const r = await svc.saveTranscript('u1', 't1', {
      mode: 'mock',
      seconds: 180,
      turns: talk,
      context: { title: 'General interview', focus: 'Behavioral' },
    });
    expect(r).toEqual({ saved: 2, scorecard: card, unscored: null });
    // the call is settled (released + charged) before the scorer runs
    expect(releaseHold).toHaveBeenCalledWith('u1', 'h1');
    expect(
      (releaseHold as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan((voiceScorecardFor as jest.Mock).mock.invocationCallOrder[0]);
    expect(voiceScorecardFor).toHaveBeenCalledWith(
      'm',
      expect.objectContaining({ title: 'General interview', focus: 'Behavioral' }),
      talk,
    );
    // the voice minutes are the only charge recorded here: the scorer meters itself (career.voice.score)
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(prisma.careerMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        thread_id: 't1',
        ui: expect.objectContaining({ type: 'voice-scorecard', scorecard: card }),
      }),
    });
  });

  it('no answers: nothing scored and no scorer call', async () => {
    const svc = service([hold(5, 1)]);
    const r = await svc.saveTranscript('u1', 't1', {
      mode: 'mock',
      seconds: 40,
      turns: [{ role: 'assistant', text: 'Hi, ready?' }],
    });
    expect(r).toMatchObject({ scorecard: null, unscored: 'empty' });
    expect(voiceScorecardFor).not.toHaveBeenCalled();
  });

  it('too little said to judge: no scorer call, no tokens spent on it', async () => {
    const svc = service([hold(5, 1)]);
    const r = await svc.saveTranscript('u1', 't1', {
      mode: 'mock',
      seconds: 60,
      turns: [talk[0], { role: 'user', text: 'yes I am ready' }],
    });
    expect(r).toMatchObject({ saved: 2, scorecard: null, unscored: 'short' });
    expect(voiceScorecardFor).not.toHaveBeenCalled();
  });

  it('no tokens left after the call is charged: the transcript is saved, the scorer does not run', async () => {
    // 10 minutes (100 tokens) reserved out of a balance that is now 0; the call used 10 minutes
    credits.account.mockResolvedValue({ balance: 0 });
    const svc = service([hold(10, 12)]);
    const r = await svc.saveTranscript('u1', 't1', {
      mode: 'mock',
      seconds: 600,
      turns: talk,
    });
    expect(r).toMatchObject({ saved: 2, scorecard: null, unscored: 'tokens' });
    expect(voiceScorecardFor).not.toHaveBeenCalled();
  });

  it('a scorer failure still keeps the transcript and the charge', async () => {
    (voiceScorecardFor as jest.Mock).mockRejectedValue(new Error('down'));
    const svc = service([hold(10, 2)]);
    const r = await svc.saveTranscript('u1', 't1', {
      mode: 'practice',
      seconds: 120,
      turns: talk,
    });
    expect(r).toMatchObject({ saved: 2, scorecard: null, unscored: 'failed' });
    expect(prisma.careerMessage.createMany).toHaveBeenCalled();
    expect(releaseHold).toHaveBeenCalledWith('u1', 'h1');
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });
});
