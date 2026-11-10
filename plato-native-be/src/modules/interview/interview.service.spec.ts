import {
  coachFor,
  followUpFor,
  generateQuestions,
  scorecardFor,
  Turn,
} from './interview';
import { InterviewService, startSchema } from './interview.service';

// @nestjs/config ships as ESM, which this Jest setup does not load; the service only needs its type
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
// Every model call is scripted: nothing here reaches a model or spends tokens.
jest.mock('./interview', () => {
  const actual =
    jest.requireActual<typeof import('./interview')>('./interview');
  return {
    ...actual,
    generateQuestions: jest.fn(),
    followUpFor: jest.fn(),
    coachFor: jest.fn(),
    scorecardFor: jest.fn(),
  };
});
const gen = generateQuestions as jest.Mock;
const follow = followUpFor as jest.Mock;
const coach = coachFor as jest.Mock;
const score = scorecardFor as jest.Mock;

const LONG = 'I led the move of our booking API to Node and TypeScript, added retries and idempotency keys, and cut failed payments by a third.';
const POST = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
const qs = (n: number): Turn[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'technical',
    question: `q${i}`,
  }));

let rows: Record<string, unknown>[];
let prisma: Record<string, Record<string, jest.Mock>>;
function service() {
  rows = [];
  prisma = {
    jobSeeker: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
    job: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'j1',
        title: 'Backend Engineer',
        company: 'Acme',
        description: POST,
      }),
    },
    mockInterview: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          rows.filter(
            (r) => r.job_id === where.job_id && r.completed_at === null,
          ),
        ),
      ),
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      ),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(({ data }) => {
        const row = {
          id: `i${rows.length + 1}`,
          scorecard: null,
          score: null,
          retry_of_id: null,
          created_at: new Date(),
          completed_at: null,
          ...data,
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
  };
  const profiles = {
    load: jest.fn().mockResolvedValue({
      headline: 'Backend developer',
      totalYears: 4,
      skills: ['Node'],
      experiences: [],
      projects: [],
    }),
  };
  const config = { get: () => ({ careerModel: 'm' }) };
  return new InterviewService(
    prisma as never,
    profiles as never,
    config as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  gen.mockImplementation((_m, ctx: { setup: { length: number } }) =>
    Promise.resolve(qs(ctx.setup.length)),
  );
  follow.mockResolvedValue(null);
  coach.mockResolvedValue({
    feedback: { score: 3, note: 'Clear, add a number.', better: 'Say 30%.' },
    followUp: null,
  });
  score.mockResolvedValue({
    questions: [],
    communication: { score: 3, note: '' },
    strengths: [],
    gaps: [],
    nextSteps: [],
    overall: 50,
  });
});

describe('start body', () => {
  const ok = (b: object) => startSchema.safeParse(b).success;
  it('needs exactly one of jobId, paste, general or retryOf', () => {
    expect(ok({})).toBe(false);
    expect(ok({ jobId: 'j1', retryOf: 'i1' })).toBe(false);
    expect(ok({ jobId: 'j1', general: { role: 'Designer' } })).toBe(false);
    expect(ok({ jobId: 'j1' })).toBe(true);
    expect(ok({ retryOf: 'i1' })).toBe(true);
    expect(ok({ general: { role: 'Designer', skill: 'Figma' } })).toBe(true);
    expect(ok({ paste: { title: 'Dev', description: POST } })).toBe(true);
  });
  it('refuses a pasted post that is too short or too long', () => {
    expect(ok({ paste: { title: 'Dev', description: 'short post here' } })).toBe(
      false,
    );
    expect(
      ok({ paste: { title: 'Dev', description: `${POST} ${'x'.repeat(12001)}` } }),
    ).toBe(false);
  });
  it('checks the choices and the length', () => {
    expect(ok({ jobId: 'j1', format: 'case', round: 'loop', style: 'coach', length: 3 })).toBe(true);
    expect(ok({ jobId: 'j1', format: 'poetry' })).toBe(false);
    expect(ok({ jobId: 'j1', length: 4 })).toBe(false);
    expect(ok({ general: { role: 'Dev' }, focus: 'behavioral' })).toBe(true);
  });
});

describe('start', () => {
  it('a job: posting from the job, defaults real / standard / manager / 6', async () => {
    const v = await service().start('u1', { jobId: 'j1' });
    const ctx = gen.mock.calls[0][1];
    expect(ctx).toMatchObject({
      title: 'Backend Engineer',
      company: 'Acme',
      description: POST,
      setup: { target: 'job', style: 'real', format: 'standard', round: 'manager', focus: null, length: 6 },
    });
    expect(gen.mock.calls[0][2]).toMatch(/Backend developer/); // profile brief
    expect(v).toMatchObject({ target: 'job', style: 'real', format: 'standard', round: 'manager', focus: null, total: 6 });
  });

  it('a pasted post: no job row, the text as given; coach defaults to 5', async () => {
    const v = await service().start('u1', {
      paste: { title: 'Data Analyst', company: 'Beta', description: POST },
      style: 'coach',
      round: 'screen',
    });
    expect(prisma.job.findUnique).not.toHaveBeenCalled();
    expect(gen.mock.calls[0][1]).toMatchObject({
      title: 'Data Analyst',
      company: 'Beta',
      description: POST,
      setup: { target: 'paste', style: 'coach', round: 'screen', length: 5 },
    });
    expect(rows[0].job_id).toBeNull();
    expect(v).toMatchObject({ target: 'paste', style: 'coach', round: 'screen' });
  });

  it('general: the role (+ skill) and focus; no round; 5 questions', async () => {
    const v = await service().start('u1', {
      general: { role: 'Product Designer', skill: 'Figma' },
      focus: 'behavioral',
      round: 'loop', // ignored: rounds are for jobs
    });
    expect(gen.mock.calls[0][1]).toMatchObject({
      title: 'Product Designer',
      setup: { target: 'general', focus: 'behavioral', round: null, role: 'Product Designer', skill: 'Figma', length: 5 },
    });
    expect(v).toMatchObject({ target: 'general', role: 'Product Designer', focus: 'behavioral', round: null, total: 5 });
  });

  it('a format and an explicit length reach the planner', async () => {
    await service().start('u1', { general: { role: 'Sales' }, format: 'negotiation', length: 3 });
    expect(gen.mock.calls[0][1].setup).toMatchObject({ format: 'negotiation', length: 3 });
  });

  it('resumes an unfinished job interview only when style, format and round match', async () => {
    const s = service();
    const first = await s.start('u1', { jobId: 'j1' });
    expect((await s.start('u1', { jobId: 'j1' })).id).toBe(first.id);
    expect((await s.start('u1', { jobId: 'j1', style: 'real', round: 'manager', format: 'standard' })).id).toBe(first.id);
    expect(gen).toHaveBeenCalledTimes(1);
    const coached = await s.start('u1', { jobId: 'j1', style: 'coach' });
    expect(coached.id).not.toBe(first.id);
    const loop = await s.start('u1', { jobId: 'j1', round: 'loop' });
    expect(loop.id).not.toBe(first.id);
    expect(gen).toHaveBeenCalledTimes(3);
    // the coached one is now resumed too
    expect((await s.start('u1', { jobId: 'j1', style: 'coach' })).id).toBe(coached.id);
  });

  it('a row from before v2 (no setup) resumes as real / standard / manager', async () => {
    const s = service();
    rows.push({ id: 'old', job_seeker_id: 's1', job_id: 'j1', job_title: 'T', company: 'C', job_description: POST, turns: qs(6), setup: null, completed_at: null, created_at: new Date(), score: null, scorecard: null, retry_of_id: null });
    expect((await s.start('u1', { jobId: 'j1' })).id).toBe('old');
    expect((await s.start('u1', { jobId: 'j1', style: 'coach' })).id).not.toBe('old');
  });

  it('the daily limit stops new starts, not resumes', async () => {
    const s = service();
    const first = await s.start('u1', { jobId: 'j1' });
    prisma.mockInterview.count.mockResolvedValue(10);
    expect((await s.start('u1', { jobId: 'j1' })).id).toBe(first.id);
    await expect(s.start('u1', { general: { role: 'Dev' } })).rejects.toMatchObject({ status: 429 });
  });

  it('a retry keeps the questions and setup, and may switch style', async () => {
    const s = service();
    const first = await s.start('u1', { general: { role: 'Dev' }, focus: 'technical' });
    const again = await s.start('u1', { retryOf: first.id, style: 'coach' });
    expect(gen).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ retryOfId: first.id, target: 'general', focus: 'technical', style: 'coach', total: 5 });
  });
});

describe('answer', () => {
  it('real: no feedback, one follow-up at most, scorecard at the end', async () => {
    const s = service();
    const v = await s.start('u1', { jobId: 'j1', length: 3 });
    follow.mockResolvedValueOnce('Which numbers?');
    let r = await s.answer('u1', v.id, LONG);
    expect(r.next).toEqual({ index: 0, text: 'Which numbers?', followUp: true });
    r = await s.answer('u1', v.id, LONG);
    expect(follow).toHaveBeenCalledTimes(1); // no call for the follow-up answer
    await s.answer('u1', v.id, LONG);
    r = await s.answer('u1', v.id, LONG);
    expect(coach).not.toHaveBeenCalled();
    expect(r.turns.every((t) => t.feedback === undefined)).toBe(true);
    expect(score).toHaveBeenCalledTimes(1);
    expect(r.completedAt).toBeTruthy();
  });

  it('coach: feedback on the answered turn right away, one call per answer', async () => {
    const s = service();
    const v = await s.start('u1', { jobId: 'j1', style: 'coach', length: 3 });
    coach.mockResolvedValueOnce({
      feedback: { score: 2, note: 'Vague.' },
      followUp: 'What did you measure?',
    });
    let r = await s.answer('u1', v.id, LONG);
    expect(coach).toHaveBeenLastCalledWith('m', expect.anything(), expect.anything(), true);
    expect(follow).not.toHaveBeenCalled();
    expect(r.turns[0].feedback).toEqual({ score: 2, note: 'Vague.' });
    expect(r.next).toMatchObject({ followUp: true, text: 'What did you measure?' });
    // the follow-up answer is coached again, with no further follow-up allowed
    coach.mockResolvedValueOnce({
      feedback: { score: 4, note: 'Better.' },
      followUp: null,
    });
    r = await s.answer('u1', v.id, LONG);
    expect(coach).toHaveBeenLastCalledWith('m', expect.anything(), expect.anything(), false);
    expect(r.turns[0].feedback).toEqual({ score: 4, note: 'Better.' });
    expect(r.next).toMatchObject({ index: 1, followUp: false });
    expect(coach).toHaveBeenCalledTimes(2);
  });

  it('still refuses answers under the minimum', async () => {
    const s = service();
    const v = await s.start('u1', { jobId: 'j1', style: 'coach' });
    await expect(s.answer('u1', v.id, 'ok')).rejects.toMatchObject({ status: 400 });
    expect(coach).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('names how each session was set up', async () => {
    const s = service();
    await s.start('u1', { general: { role: 'Dev' }, format: 'english' });
    prisma.mockInterview.findMany.mockResolvedValueOnce(rows);
    const [item] = await s.list('u1');
    expect(item).toMatchObject({ target: 'general', format: 'english', style: 'real', role: 'Dev', round: null, focus: 'mixed' });
  });
});
