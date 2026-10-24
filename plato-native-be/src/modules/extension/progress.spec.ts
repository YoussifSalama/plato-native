import { extensionProgress } from './progress';

const item = (id: string, state: string, extra: any = {}) => ({ id, job_id: 'j' + id, state, updated_at: new Date(), detail: null, ...extra });

describe('extensionProgress', () => {
  it('buckets states, names the jobs, says whether a linked browser is online', async () => {
    const prisma: any = {
      applyBatchItem: { findMany: async () => [item('1', 'REVIEW'), item('2', 'NEEDS_USER', { detail: { last: { reason: 'questions', message: 'Needs your answer: Salary' } } }), item('3', 'SUBMITTED_CONFIRMED'), item('4', 'PENDING'), item('5', 'PENDING'), item('6', 'SKIPPED')] },
      job: { findMany: async () => [{ id: 'j2', title: 'Dev', company: 'Acme' }] },
      extensionDevice: { findMany: async () => [{ last_used_at: new Date() }, { last_used_at: new Date(Date.now() - 3600_000) }] },
    };
    const p = await extensionProgress(prisma, 's1');
    expect(p.counts).toEqual({ waiting: 2, working: 1, needsYou: 1, submitted: 1, failed: 0, skipped: 1 });
    expect(p.active).toBe(2);
    expect(p.online).toBe(true);
    expect(p.recent.find((r) => r.id === '2')).toMatchObject({ title: 'Dev', company: 'Acme', note: 'Needs your answer: Salary' });
  });

  it('offline when no linked browser spoke recently', async () => {
    const prisma: any = { applyBatchItem: { findMany: async () => [] }, job: { findMany: async () => [] }, extensionDevice: { findMany: async () => [{ last_used_at: new Date(Date.now() - 600_000) }] } };
    expect(await extensionProgress(prisma, 's1')).toMatchObject({ online: false, linked: true, active: 0 });
  });
});
