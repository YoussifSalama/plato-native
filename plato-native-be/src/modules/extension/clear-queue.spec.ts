import { ExtensionBatchService } from './batch.service';

describe('clearPending', () => {
  it('cancels only this seeker\'s PENDING items, never started ones', async () => {
    let call: any;
    const prisma: any = { applyBatchItem: { updateMany: async (a: any) => ((call = a), { count: 3 }) } };
    const out = await new ExtensionBatchService(prisma, {} as any).clearPending('s1');
    expect(out).toEqual({ cleared: 3 });
    expect(call.where).toEqual({ job_seeker_id: 's1', state: 'PENDING' }); // started jobs keep their state
    expect(call.data.state).toBe('CANCELLED');
  });
});
