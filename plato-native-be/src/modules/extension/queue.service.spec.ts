import { QueueService } from './queue.service';
import { readSettings, SPEED_TABS } from './settings';

describe('queue narrowing', () => {
  const prisma: any = {
    applyBatchItem: {
      findMany: async () => [{ id: 'i1', job_id: 'j1' }, { id: 'i2', job_id: 'j2' }, { id: 'i3', job_id: 'j3' }],
      updateMany: async (a: any) => ({ count: a.where.id.in.length, ids: a.where.id.in }),
    },
    job: { findMany: async () => [{ id: 'j1', company: 'Google LLC', title: 'A' }, { id: 'j2', company: 'Acme', title: 'B' }, { id: 'j3', company: 'Exadel', title: 'C' }] },
    jobSeekerJobMatch: { findMany: async () => [{ job_id: 'j1', match_score: 9 }, { job_id: 'j2', match_score: 5 }, { job_id: 'j3', match_score: 10 }] },
  };
  const svc = new QueueService(prisma, { referenceScore: async () => 10 } as any);

  it('drops waiting jobs under a match % and from named companies, keeps the rest', async () => {
    expect(await svc.drop('s1', { minMatch: 90 })).toEqual({ dropped: 1, companies: ['Acme'] }); // 50% < 90
    expect(await svc.drop('s1', { companies: ['google'] })).toEqual({ dropped: 1, companies: ['Google LLC'] });
  });
});

describe('settings', () => {
  it('fills defaults and ignores junk', () => {
    expect(readSettings(null)).toEqual({ autoSubmit: true, coverLetter: true, speed: 'smart', customMessage: '', resumeMode: 'profile' });
    expect(readSettings({ speed: 'fast', evil: 1 })).toEqual({ autoSubmit: true, coverLetter: true, speed: 'smart', customMessage: '', resumeMode: 'profile' }); // strict: unknown keys reject the whole object
    expect(readSettings({ speed: 'fast' }).speed).toBe('fast');
    expect(SPEED_TABS.smart).toBe(4);
  });
});
