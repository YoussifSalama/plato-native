import { ConflictException } from '@nestjs/common';
import { V3SessionService } from './v3-session.service';
import { REASK } from './review';

// turn() around SUBMIT_READY: the field list, the re-ask, the hold, the approval, and the executor's submit_pressed.
// The model, the database and the batch service are stubs; a session is opened by hand (open() needs the real DB).

const LIST = '```json\n{"fields":[{"label":"Full name","value":"Youssif Salama","source":"cv"},{"label":"Expected salary","value":"5000","source":"guess"}]}\n```';
const P = { jobSeekerId: 's1', deviceId: 'd1' } as never;

function setup(mode: 'auto' | 'review' | null, replies: string[], setting: 'auto' | 'review' = 'auto') {
  process.env.ANTHROPIC_API_KEY ??= 'test';
  const saved: unknown[] = [];
  const batches = {
    assertWorking: jest.fn(() => Promise.resolve({ job_id: 'j1', batch_id: 'b1', detail: {} })),
    submitModeOf: jest.fn(() => Promise.resolve(mode)),
    saveReview: jest.fn((_id: string, r: unknown) => Promise.resolve(void saved.push(structuredClone(r)))),
  };
  const prisma = { jobSeeker: { findUnique: jest.fn(() => Promise.resolve({ extension_settings: { submitMode: setting } })) } };
  const svc = new V3SessionService(prisma as never, batches as never, {} as never);
  const create = jest.fn(() => Promise.resolve({ content: [{ type: 'text', text: replies.shift() ?? 'BLOCKED out of replies' }], usage: { input_tokens: 1, output_tokens: 1 } }));
  (svc as unknown as { client: unknown }).client = { beta: { messages: { create } } };
  const s = {
    itemId: 'i1', jobSeekerId: 's1', model: 'claude-sonnet-5-5', system: '', messages: [], turns: 0, window: Date.now(), timeAsked: false,
    hosts: ['x.test'], pending: new Map(), createAccounts: false, submitAllowed: false, submitPressed: false, batchId: 'b1',
    sources: { cv: 'Youssif Salama, Cairo', profile: [], job: 'Engineer at Initech', today: '2026-11-26', coverLetter: true, saved: [] },
    said: [], resumeUploaded: false, listAsked: false, startedAt: Date.now(), lastAt: Date.now(),
  };
  (svc as unknown as { sessions: Map<string, unknown> }).sessions.set('i1', s);
  return { svc, create, saved, s, batches };
}
const lastUserText = (create: jest.Mock) => {
  const msgs = (create.mock.calls.at(-1) as [{ messages: { role: string; content: { type: string; text?: string }[] }[] }])[0].messages;
  return msgs.filter((m) => m.role === 'user').at(-1)!.content.map((c) => c.text ?? '').join('\n');
};

describe('v3 turn: review before Submit', () => {
  it('a valid list: checked, held in review mode, stored on the item', async () => {
    const { svc, saved } = setup('review', [`SUBMIT_READY all set\n${LIST}`]);
    const r = await svc.turn(P, 'i1', { event: 'continue' });
    expect('outcome' in r && r.outcome).toMatchObject({ kind: 'submit_ready', summary: 'all set', review: { complete: true, hold: true, holdReason: 'review_mode' } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ complete: true, fields: [{ status: 'ok' }, { status: 'guess', sensitive: true, category: 'pay' }] });
  });

  it('no list: asks once more; a list on the second try is used', async () => {
    const { svc, create } = setup('auto', ['SUBMIT_READY done', `SUBMIT_READY done\n${LIST}`]);
    const r = await svc.turn(P, 'i1', { event: 'continue' });
    expect(create).toHaveBeenCalledTimes(2);
    expect(lastUserText(create)).toBe(REASK);
    expect('outcome' in r && r.outcome).toMatchObject({ review: { complete: true, hold: true, holdReason: 'sensitive' } }); // the salary is a guess
  });

  it('no list twice: complete false, held in auto mode too; the next SUBMIT_READY may be asked again', async () => {
    const { svc, create, s } = setup('auto', ['SUBMIT_READY done', 'SUBMIT_READY done, really']);
    const r = await svc.turn(P, 'i1', { event: 'continue' });
    expect(create).toHaveBeenCalledTimes(2);
    expect('outcome' in r && r.outcome).toMatchObject({ review: { fields: [], complete: false, hold: true, holdReason: 'no_list' } });
    expect(s.listAsked).toBe(false);
  });

  it.each([
    [null, 'review', true],
    [null, 'auto', false],
    ['auto', 'review', true], // the seeker switched back to review: never auto-sent
    ['review', 'auto', true],
    ['auto', 'auto', false],
  ] as const)('batch %s + setting %s: held %s', async (batch, setting, held) => {
    const { svc } = setup(batch, ['SUBMIT_READY x\n```json\n{"fields":[{"label":"Full name","value":"Youssif Salama","source":"cv"}]}\n```'], setting);
    const r = await svc.turn(P, 'i1', { event: 'continue' });
    expect('outcome' in r && r.outcome).toMatchObject({ review: { hold: held, ...(held && { holdReason: 'review_mode' }) } });
  });

  it('submit: refused before any SUBMIT_READY, and while a held review is not approved', async () => {
    const { svc } = setup('auto', [`SUBMIT_READY x\n${LIST}`, 'CONFIRMED Thanks for applying']);
    await expect(svc.turn(P, 'i1', { event: 'submit' })).rejects.toThrow(new ConflictException('submit_not_ready'));
    await svc.turn(P, 'i1', { event: 'continue' });
    await expect(svc.turn(P, 'i1', { event: 'submit' })).rejects.toThrow(new ConflictException('review_needed')); // auto mode, sensitive guess
  });

  it('submit with the seeker\'s approval: approvedBy user, Submit allowed', async () => {
    const { svc, saved, s } = setup('review', [`SUBMIT_READY x\n${LIST}`, 'CONFIRMED Thanks for applying']);
    await svc.turn(P, 'i1', { event: 'continue' });
    const r = await svc.turn(P, 'i1', { event: 'submit', approved: true });
    expect('outcome' in r && r.outcome.kind).toBe('confirmed');
    expect(s.submitAllowed).toBe(true);
    expect(saved.at(-1)).toMatchObject({ approvedBy: 'user', approvedAt: expect.any(String) as string });
  });

  it('auto mode, nothing held: approvedBy auto', async () => {
    const { svc, saved } = setup('auto', ['SUBMIT_READY x\n```json\n{"fields":[{"label":"Full name","value":"Youssif Salama","source":"cv"}]}\n```', 'CONFIRMED ok']);
    await svc.turn(P, 'i1', { event: 'continue' });
    await svc.turn(P, 'i1', { event: 'submit' });
    expect(saved.at(-1)).toMatchObject({ hold: false, approvedBy: 'auto' });
  });

  it('the seeker\'s edits reach the model and verify as their answers', async () => {
    const { svc, create } = setup('review', ['SUBMIT_READY fixed\n```json\n{"fields":[{"label":"Expected salary","value":"4200","source":"answer"}]}\n```']);
    const r = await svc.turn(P, 'i1', { event: 'seeker_answer', text: 'Change these fields before submitting: Expected salary: 4200', answers: [{ id: 'salary', label: 'Expected salary', value: '4200' }] });
    expect(lastUserText(create)).toContain('- Expected salary: 4200');
    expect('outcome' in r && r.outcome).toMatchObject({ review: { fields: [{ verified: true, status: 'ok', sensitive: true }] } });
  });

  it('submitPressed comes from the executor\'s submit_pressed, not from the result text', async () => {
    const { svc, s } = setup('review', ['BLOCKED x', 'BLOCKED y']);
    s.submitAllowed = true;
    s.pending = new Map([['c1', { call_id: 'c1', name: 'left_click', input: {} }]]);
    await svc.turn(P, 'i1', { event: 'results', results: [{ call_id: 'c1', ok: true, text: 'Clicked "Submit application"' }] });
    expect(s.submitPressed).toBe(false);
    s.pending = new Map([['c2', { call_id: 'c2', name: 'key', input: {} }]]);
    await svc.turn(P, 'i1', { event: 'results', results: [{ call_id: 'c2', ok: true, text: 'Pressed Enter', submit_pressed: true }] });
    expect(s.submitPressed).toBe(true);
  });
});
