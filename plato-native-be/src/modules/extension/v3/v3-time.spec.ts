process.env.ANTHROPIC_API_KEY ??= 'test';
jest.mock('../../usage/usage', () => ({ recordUsage: jest.fn() }));
import { V3SessionService } from './v3-session.service';

// No step cap: every 5 minutes the model is asked whether the application is still moving; RENEW gives it 5 more.
describe('v3: the 5-minute window the model renews itself', () => {
  const reply = (text: string, click = false) => ({
    content: [{ type: 'text', text }, ...(click ? [{ type: 'tool_use', id: `c${Math.random()}`, name: 'left_click', input: {} }] : [])],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  const setup = (replies: object[]) => {
    const create = jest.fn();
    replies.forEach((r) => create.mockResolvedValueOnce(r));
    const svc = new V3SessionService({} as never, { assertWorking: async () => ({ job_id: 'j' }) } as never, {} as never) as any;
    svc.client = { beta: { messages: { create } } };
    const s = { itemId: 'i', jobSeekerId: 'p', model: 'claude-sonnet-5-5', system: '', messages: [], turns: 0, window: Date.now() - 6 * 60_000, timeAsked: false, hosts: ['jobs.example'], pending: new Map(), createAccounts: true, submitAllowed: false, submitPressed: false, startedAt: 0, lastAt: Date.now() };
    svc.sessions.set('i', s);
    return { s, create, turn: (event = 'results') => svc.turn({ jobSeekerId: 'p' }, 'i', { event, results: [] }) };
  };
  const lastUserText = (s: any) => JSON.stringify(s.messages.filter((m: any) => m.role === 'user').at(-1));

  it('after 5 minutes the model is asked; RENEW with actions renews and the actions run', async () => {
    const t = setup([reply('RENEW page 6 of 9 done, 3 left', true)]);
    const r = await t.turn();
    expect(lastUserText(t.s)).toMatch(/TIME: 5 more minutes/);
    expect(r.calls).toHaveLength(1);
    expect(t.s.timeAsked).toBe(false);
    expect(Date.now() - t.s.window).toBeLessThan(1000);
  });

  it('RENEW alone: told to continue, asked again in the same turn', async () => {
    const t = setup([reply('RENEW still filling'), reply('', true)]);
    expect((await t.turn()).calls).toHaveLength(1);
    expect(t.create).toHaveBeenCalledTimes(2);
  });

  it('BLOCKED at the check stops the application', async () => {
    const t = setup([reply('BLOCKED the same error after every Save')]);
    expect((await t.turn()).outcome).toMatchObject({ kind: 'blocked' });
  });

  it('a seeker action (Try again) starts a fresh 5 minutes: no check', async () => {
    const t = setup([reply('', true)]);
    await t.turn('continue');
    expect(lastUserText(t.s)).not.toMatch(/TIME:/);
  });
});
