/* eslint-disable */
// Real-Mongo check of the conditional updates the fake can only imitate.
// Skipped unless SCRATCH_DB_URI points at the isolated scratch instance
// (127.0.0.1:27099/plato_scratch). Never runs against anything else.
import { PrismaClient } from '@prisma/client';
import { ExtensionBatchService } from './batch.service';
import { ExtensionService } from './extension.service';
import { limiter } from './extension-auth.guard';

const uri = process.env.SCRATCH_DB_URI;
const safe = (() => {
  if (!uri) return false;
  const u = new URL(uri);
  return u.hostname === '127.0.0.1' && u.port === '27099' && u.pathname === '/plato_scratch';
})();
if (uri && !safe) throw new Error('SCRATCH_DB_URI is not the scratch database: refusing to run');

(safe ? describe : describe.skip)('batch service on real Mongo (scratch)', () => {
  let prisma: PrismaClient;
  let svc: ExtensionBatchService;
  const bus = { publish: jest.fn() };
  const oid = () => [...Array(24)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  const A = { deviceId: oid(), jobSeekerId: '', scopes: [] };
  const B = { deviceId: oid(), jobSeekerId: '', scopes: [] };
  let seeker = '';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: uri });
    svc = new ExtensionBatchService(prisma as any, bus as any);
    svc.policy = () => 'FILL_ONLY';
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    limiter['hits'].clear();
    seeker = oid();
    A.jobSeekerId = B.jobSeekerId = seeker;
  });

  const newItem = async () => {
    const job = await prisma.job.create({
      data: { source: 'WORKABLE', external_id: oid(), title: 'Dev', company: 'Acme', url: 'https://example.test/' + oid() },
    });
    const r = await svc.createBatch(seeker, [job.id]);
    return { job, item: r.items[0] };
  };
  const appOf = (jobId: string) =>
    prisma.jobApplication.findUnique({ where: { job_seeker_id_job_id: { job_seeker_id: seeker, job_id: jobId } } });

  it('full cycle: claim, race, arm, lease loss -> VERIFY, attest -> SUBMITTED', async () => {
    const { job, item } = await newItem();
    const res = await Promise.allSettled([svc.claim(A, item.id), svc.claim(B, item.id)]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.jobApplication.count({ where: { job_id: job.id } })).toBe(1);
    expect(await appOf(job.id)).toMatchObject({ status: 'EXTENSION_ACTIVE', engine: 'EXTENSION' });

    const won = (res.find((r) => r.status === 'fulfilled') as any).value;
    const who = won ? (await prisma.applyBatchItem.findUnique({ where: { id: item.id } }))!.device_id === A.deviceId ? A : B : A;
    let seq = 0;
    for (const to of ['PREPARING', 'FILLING', 'REVIEW', 'AWAITING_SUBMIT'])
      await svc.transition(who, item.id, { attempt_id: won.attempt_id, seq: ++seq, to: to as any });
    // replay is idempotent on real documents too
    await svc.transition(who, item.id, { attempt_id: won.attempt_id, seq: 4, to: 'AWAITING_SUBMIT' });

    await prisma.applyBatchItem.update({ where: { id: item.id }, data: { lease_expires_at: new Date(Date.now() - 1000) } });
    const [v] = await svc.list(A);
    expect(v).toMatchObject({ state: 'VERIFY' });
    expect((await appOf(job.id))!.status).toBe('EXTENSION_ACTIVE');

    await svc.transition(B, item.id, { attempt_id: won.attempt_id, seq: 5, to: 'SUBMITTED_ATTESTED' });
    expect(await appOf(job.id)).toMatchObject({ status: 'SUBMITTED' });
    expect((await appOf(job.id))!.evidence).toMatchObject({ confirmed_by: 'user_attestation' });
  });

  it('pre-armed lease loss releases the lock (row deleted) and restores a prior FAILED row', async () => {
    const { job, item } = await newItem();
    const c = await svc.claim(A, item.id);
    await prisma.applyBatchItem.update({ where: { id: item.id }, data: { lease_expires_at: new Date(Date.now() - 1000) } });
    await svc.recover(seeker);
    expect(await appOf(job.id)).toBeNull();
    expect((await prisma.applyBatchItem.findUnique({ where: { id: item.id } }))!.state).toBe('PENDING');
    await expect(svc.transition(A, item.id, { attempt_id: c.attempt_id, seq: 1, to: 'PREPARING' })).rejects.toThrow();

    await prisma.jobApplication.create({ data: { job_seeker_id: seeker, job_id: job.id, status: 'FAILED', failure_kind: 'site_error' } });
    await svc.claim(A, item.id);
    expect((await appOf(job.id))!.status).toBe('EXTENSION_ACTIVE');
    await svc.release(seeker, item.id);
    expect(await appOf(job.id)).toMatchObject({ status: 'FAILED', engine: null });
  });

  it('two items on one job: unique constraint yields a single lock', async () => {
    const { job, item } = await newItem();
    const i2 = await prisma.applyBatchItem.create({ data: { batch_id: oid(), job_seeker_id: seeker, job_id: job.id, provider: 'workable' } });
    const res = await Promise.allSettled([svc.claim(A, item.id), svc.claim(B, i2.id)]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.jobApplication.count({ where: { job_id: job.id } })).toBe(1);
  });

  it('VERIFY: notified once per attempt on real Mongo, and the bell feed query sees it only while it waits', async () => {
    bus.publish.mockClear();
    const { job, item } = await newItem();
    const c = await svc.claim(A, item.id);
    let seq = 0;
    for (const to of ['PREPARING', 'FILLING', 'REVIEW', 'AWAITING_SUBMIT'])
      await svc.transition(A, item.id, { attempt_id: c.attempt_id, seq: ++seq, to: to as any });
    const toVerify = () => svc.transition(A, item.id, { attempt_id: c.attempt_id, seq: 5, to: 'VERIFY', detail: { reason: 'user_unsure' } });
    await toVerify();
    await toVerify(); // client retry
    await svc.recover(seeker);
    await svc.list(A);
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish.mock.calls[0][1]).toMatchObject({ status: 'VERIFY', id: expect.stringContaining(c.attempt_id) });
    expect(await appOf(job.id)).toMatchObject({ status: 'EXTENSION_ACTIVE', verify_attempt: c.attempt_id, needs_input: { reason: 'verify_submission' } });

    // the notifications controller's query
    const feed = () =>
      prisma.jobApplication.findMany({
        where: {
          job_seeker_id: seeker,
          OR: [
            { status: { in: ['NEEDS_INPUT', 'NEEDS_USER_VERIFICATION', 'SUBMITTED', 'FAILED', 'EXPIRED'] as never } },
            { status: 'EXTENSION_ACTIVE', verify_attempt: { not: null } },
          ],
        },
      });
    expect((await feed()).map((a) => a.job_id)).toEqual([job.id]);

    await svc.transition(B, item.id, { attempt_id: c.attempt_id, seq: 6, to: 'FAILED', detail: { failure_kind: 'not_submitted' } });
    expect(await appOf(job.id)).toMatchObject({ status: 'FAILED', needs_input: null, verify_attempt: null });
    // still in the feed, but now as the ordinary FAILED notification
    expect((await feed()).map((a) => a.status)).toEqual(['FAILED']);
  });

  // Missing-vs-null on Mongo bit us once (a filter that never matched): run the
  // pairing / device lifecycle on the real thing too.
  it('pairing and device lifecycle on real Mongo: single use, five-device cap, revoke, authenticate', async () => {
    const ext = new ExtensionService(prisma as any);
    const pair = async () => ext.exchange((await ext.startPairing(seeker)).code, 'Laptop', '0.1.0');
    const first = await pair();
    expect(await ext.authenticate(first.token)).toMatchObject({ jobSeekerId: seeker });
    const { code } = await ext.startPairing(seeker);
    await ext.exchange(code, 'x');
    await expect(ext.exchange(code, 'again')).rejects.toThrow('Invalid or expired');
    for (let i = 0; i < 3; i++) await pair(); // 5 active now
    expect(await ext.listDevices(seeker)).toHaveLength(5);
    const sixth = (await ext.startPairing(seeker)).code;
    await expect(ext.exchange(sixth, 'sixth')).rejects.toThrow('Device limit');
    const [oldest] = (await ext.listDevices(seeker)).slice(-1);
    await ext.revoke(seeker, oldest!.id);
    expect(await ext.listDevices(seeker)).toHaveLength(4);
    await expect(ext.exchange(sixth, 'sixth')).resolves.toBeDefined(); // refused code was not consumed
    expect(await ext.revokeAll(seeker)).toEqual({ revoked: 5 });
    expect(await ext.authenticate(first.token)).toBeNull();
  });
});
