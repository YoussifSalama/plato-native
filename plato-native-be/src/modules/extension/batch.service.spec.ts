/* eslint-disable */
import { ExtensionBatchService } from './batch.service';
import { limiter } from './extension-auth.guard';
import { PROVIDER_POLICY } from './provider-policy';
import { fakePrisma } from './testing/fake-prisma';

const A = { deviceId: 'dev-A', jobSeekerId: 'seeker1', scopes: [] };
const B = { deviceId: 'dev-B', jobSeekerId: 'seeker1', scopes: [] };
const OTHER = { deviceId: 'dev-C', jobSeekerId: 'seeker2', scopes: [] };

const makeBus = () => ({ publish: jest.fn() });
const setup = () => {
  const prisma = fakePrisma();
  const bus = makeBus();
  const svc = new ExtensionBatchService(prisma as any, bus as any);
  // Fixture provider: the real gate keeps everything BLOCKED (tested below).
  svc.policy = () => 'FILL_ONLY';
  return { prisma, svc, bus };
};
const jobId = (n: number) => String(n).padStart(24, '1');
const addJob = (prisma: any, n = 1, source = 'WORKABLE') =>
  prisma.job.create({
    data: { id: undefined, source, apply_url: null, url: 'https://x.test/' + n },
  }).then((j: any) => (j.id = jobId(n), j));
const item = async (prisma: any, svc: any, n = 1) => {
  const job = await addJob(prisma, n);
  const r = await svc.createBatch('seeker1', [job.id]);
  return r.items[0];
};
const app = (prisma: any, id = jobId(1)) =>
  prisma.jobApplication.rows.find((a: any) => a.job_id === id);
const drive = async (svc: any, p: any, it: any, steps: [string, any?][]) => {
  let seq = 0;
  let last;
  for (const [to, detail] of steps)
    last = await svc.transition(p, it.id, { attempt_id: it.attempt_id, seq: ++seq, to, detail });
  return last;
};
const upToReview: [string, any?][] = [['PREPARING'], ['FILLING'], ['REVIEW']];
const armed: [string, any?][] = [...upToReview, ['AWAITING_SUBMIT']];
const expireLease = (prisma: any, id: string) => {
  prisma.applyBatchItem.rows.find((r: any) => r.id === id).lease_expires_at = new Date(Date.now() - 1);
};

beforeEach(() => limiter['hits'].clear());

describe('provider gate', () => {
  it('a BLOCKED provider: no batch, and no claim, with the real policy', async () => {
    PROVIDER_POLICY.workable = 'BLOCKED'; // every registered provider is enabled now: block one to test the gate
    const prisma = fakePrisma();
    const svc = new ExtensionBatchService(prisma as any, makeBus() as any); // real policy
    const job = await addJob(prisma);
    const r = await svc.createBatch('seeker1', [job.id]);
    expect(r).toMatchObject({ batch_id: null, rejected: [{ reason: 'provider_blocked' }] });
    expect(prisma.applyBatchItem.rows).toHaveLength(0);
    // even a hand-made item can't be claimed
    const it = await prisma.applyBatchItem.create({
      data: { batch_id: 'b', job_seeker_id: 'seeker1', job_id: job.id, provider: 'workable' },
    });
    await expect(svc.claim(A, it.id)).rejects.toThrow('blocked');
    expect(prisma.jobApplication.rows).toHaveLength(0);
    PROVIDER_POLICY.workable = 'FILL_ONLY';
  });

  it('rejects unknown jobs, feed-only sources and duplicates at creation', async () => {
    const { prisma, svc } = setup();
    const ok = await addJob(prisma, 1);
    const gated = await addJob(prisma, 2, 'REMOTIVE'); // a feed source: its own listing page, no form of ours
    await prisma.jobApplication.create({
      data: { job_seeker_id: 'seeker1', job_id: jobId(3), status: 'SUBMITTED' },
    });
    const sub = await addJob(prisma, 3);
    const r = await svc.createBatch('seeker1', [ok.id, gated.id, sub.id, jobId(9)]);
    expect(r.items.map((i: any) => i.job_id)).toEqual([ok.id]);
    expect(Object.fromEntries(r.rejected.map((x: any) => [x.job_id, x.reason]))).toEqual({
      [gated.id]: 'no_provider',
      [sub.id]: 'duplicate',
      [jobId(9)]: 'unknown_job',
    });
    // same job again while its item is live
    expect((await svc.createBatch('seeker1', [ok.id])).rejected[0].reason).toBe('duplicate');
  });
});

describe('claim and the duplicate lock', () => {
  it('claim takes the lock: EXTENSION_ACTIVE, engine EXTENSION, lease, attempt', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const c = await svc.claim(A, it.id);
    expect(c).toMatchObject({ state: 'CLAIMED', seq: 0 });
    expect(c.attempt_id).toBeTruthy();
    expect(app(prisma)).toMatchObject({ status: 'EXTENSION_ACTIVE', engine: 'EXTENSION' });
  });

  it('two devices racing: exactly one wins', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const res = await Promise.allSettled([svc.claim(A, it.id), svc.claim(B, it.id)]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(prisma.jobApplication.rows).toHaveLength(1);
  });

  it('two items for one job (two batches) racing: one lock, loser skipped', async () => {
    const { prisma, svc } = setup();
    const job = await addJob(prisma);
    const i1 = await prisma.applyBatchItem.create({ data: { batch_id: 'b1', job_seeker_id: 'seeker1', job_id: job.id, provider: 'workable' } });
    const i2 = await prisma.applyBatchItem.create({ data: { batch_id: 'b2', job_seeker_id: 'seeker1', job_id: job.id, provider: 'workable' } });
    const res = await Promise.allSettled([svc.claim(A, i1.id), svc.claim(B, i2.id)]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(prisma.jobApplication.rows).toHaveLength(1);
    const states = [i1, i2].map((i) => i.state).sort();
    expect(states).toContain('SKIPPED');
  });

  it.each(['QUEUED', 'IN_PROGRESS', 'NEEDS_INPUT', 'NEEDS_USER_VERIFICATION', 'SUBMITTED', 'EXTENSION_ACTIVE'])(
    'job already %s: refused, row untouched',
    async (status) => {
      const { prisma, svc } = setup();
      const it = await item(prisma, svc);
      await prisma.jobApplication.create({ data: { job_seeker_id: 'seeker1', job_id: jobId(1), status } });
      await expect(svc.claim(A, it.id)).rejects.toThrow('already has an application');
      expect(it.state).toBe('PENDING');
      expect(app(prisma).status).toBe(status);
    },
  );

  it('a FAILED application can be retried; cancelling restores it', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    await prisma.jobApplication.create({ data: { job_seeker_id: 'seeker1', job_id: jobId(1), status: 'FAILED', failure_kind: 'site_error' } });
    const c = await svc.claim(A, it.id);
    expect(app(prisma).status).toBe('EXTENSION_ACTIVE');
    await svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 1, to: 'CANCELLED' });
    expect(app(prisma)).toMatchObject({ status: 'FAILED', engine: null });
  });

  it("another seeker's item is invisible", async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    await expect(svc.claim(OTHER, it.id)).rejects.toThrow('not found');
  });
});

describe('list', () => {
  it('includes the job title, company and url for the panel', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    prisma.job.rows[0].title = 'Dev';
    prisma.job.rows[0].company = 'Acme';
    const [row] = await svc.list(A);
    expect(row.id).toBe(it.id);
    expect(row.job).toEqual({ title: 'Dev', company: 'Acme', url: 'https://x.test/1', apply_url: null });
  });
});

describe('transitions', () => {
  it('walks to SUBMITTED_CONFIRMED with evidence; the application becomes SUBMITTED', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const c = await svc.claim(A, it.id);
    const done = await drive(svc, A, c, [...armed, ['SUBMITTED_CONFIRMED', { marker: 'Application received' }]]);
    expect(done.state).toBe('SUBMITTED_CONFIRMED');
    expect(app(prisma)).toMatchObject({ status: 'SUBMITTED', engine: 'EXTENSION' });
    expect(app(prisma).evidence).toMatchObject({ confirmed_by: 'page_marker', marker: 'Application received' });
  });

  it('attestation is recorded separately from machine confirmation', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    await drive(svc, A, c, [...armed, ['SUBMITTED_ATTESTED']]);
    expect(app(prisma).evidence).toMatchObject({ confirmed_by: 'user_attestation', marker: null });
  });

  it('machine confirmation without evidence is refused', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    await drive(svc, A, c, armed);
    await expect(svc.transition(A, c.id, { attempt_id: c.attempt_id, seq: 5, to: 'SUBMITTED_CONFIRMED' })).rejects.toThrow('evidence');
    expect(app(prisma).status).toBe('EXTENSION_ACTIVE');
  });

  it('rejects illegal moves, skipped/old seq, stale attempt, wrong device', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    const t = (over: object, p = A) => svc.transition(p, c.id, { attempt_id: c.attempt_id, seq: 1, to: 'PREPARING', ...over } as any);
    await expect(t({ to: 'AWAITING_SUBMIT' })).rejects.toThrow('Cannot move');
    await expect(t({ seq: 3 })).rejects.toThrow('Out of order');
    await expect(t({ attempt_id: 'old' })).rejects.toThrow('Stale');
    await expect(t({}, B)).rejects.toThrow('another device');
    await expect(t({})).resolves.toMatchObject({ state: 'PREPARING', seq: 1 });
    await expect(t({ seq: 0 })).rejects.toThrow('Out of order');
  });

  it('replay of an applied transition is idempotent; a different one is not', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    const body = { attempt_id: c.attempt_id, seq: 1, to: 'PREPARING' } as any;
    const first = await svc.transition(A, c.id, body);
    expect(await svc.transition(A, c.id, body)).toEqual(first);
    await expect(svc.transition(A, c.id, { ...body, to: 'FAILED' })).rejects.toThrow('Out of order');
  });

  it('replaying a terminal transition repairs an application row that missed it', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    await drive(svc, A, c, [...armed, ['SUBMITTED_ATTESTED']]);
    app(prisma).status = 'EXTENSION_ACTIVE'; // crash between item write and mirror
    await svc.transition(A, c.id, { attempt_id: c.attempt_id, seq: 5, to: 'SUBMITTED_ATTESTED' });
    expect(app(prisma).status).toBe('SUBMITTED');
  });

  it('FAILED and SKIPPED are mirrored; the job can be tried again later', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    await drive(svc, A, c, [['PREPARING'], ['FAILED', { failure_kind: 'blocked_by_site', message: 'CAPTCHA wall' }]]);
    expect(app(prisma)).toMatchObject({ status: 'FAILED', failure_kind: 'blocked_by_site', error: 'CAPTCHA wall' });
  });

  it('once armed, nothing can cancel, fail or skip it', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    await drive(svc, A, c, armed);
    for (const to of ['CANCELLED', 'FAILED', 'SKIPPED', 'REVIEW', 'FILLING'])
      await expect(svc.transition(A, c.id, { attempt_id: c.attempt_id, seq: 5, to } as any)).rejects.toThrow('Cannot move');
  });
});

describe('lease, heartbeat and recovery', () => {
  it('lease lost before the page was armed releases item and lock; old attempt is dead', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const c = await svc.claim(A, it.id);
    await drive(svc, A, c, [['PREPARING'], ['FILLING']]);
    expireLease(prisma, it.id);
    const list = await svc.list(A);
    expect(list[0]).toMatchObject({ state: 'PENDING', attempt_id: null });
    expect(app(prisma)).toBeUndefined(); // created by this attempt -> deleted
    await expect(svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 3, to: 'REVIEW' })).rejects.toThrow('Stale');
    const again = await svc.claim(B, it.id);
    expect(again.attempt_id).not.toBe(c.attempt_id);
  });

  it('release restores the prior application status, not a delete', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    await prisma.jobApplication.create({ data: { job_seeker_id: 'seeker1', job_id: jobId(1), status: 'SKIPPED' } });
    await svc.claim(A, it.id);
    expireLease(prisma, it.id);
    await svc.recover('seeker1');
    expect(app(prisma)).toMatchObject({ status: 'SKIPPED', engine: null });
  });

  it('lease lost after arming goes to VERIFY and KEEPS the lock; never back to PENDING', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const c = await svc.claim(A, it.id);
    await drive(svc, A, c, armed);
    expireLease(prisma, it.id);
    const [v] = await svc.list(A);
    expect(v).toMatchObject({ state: 'VERIFY', verify_reason: 'lease_expired_after_ready' });
    expect(app(prisma).status).toBe('EXTENSION_ACTIVE');
    // nobody can claim the same job meanwhile
    const dup = await prisma.applyBatchItem.create({ data: { batch_id: 'b9', job_seeker_id: 'seeker1', job_id: jobId(1), provider: 'workable' } });
    await expect(svc.claim(B, dup.id)).rejects.toThrow('already has an application');
    // the recovery job is idempotent
    await svc.recover('seeker1');
    expect((await svc.list(A)).find((i: any) => i.id === it.id)!.state).toBe('VERIFY');
  });

  it('VERIFY is settled by a person: attested (any paired device) or not submitted', async () => {
    for (const [to, detail, status] of [
      ['SUBMITTED_ATTESTED', undefined, 'SUBMITTED'],
      ['SUBMITTED_CONFIRMED', { marker: 'Thanks for applying' }, 'SUBMITTED'],
      ['FAILED', { failure_kind: 'not_submitted' }, 'FAILED'],
    ] as const) {
      const { prisma, svc } = setup();
      const it = await item(prisma, svc);
      const c = await svc.claim(A, it.id);
      await drive(svc, A, c, armed);
      expireLease(prisma, it.id);
      await svc.recover('seeker1');
      await svc.transition(B, it.id, { attempt_id: c.attempt_id, seq: 5, to, detail } as any);
      expect(app(prisma).status).toBe(status);
    }
  });

  it('VERIFY cannot be cancelled, skipped or released from the web', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const c = await svc.claim(A, it.id);
    await drive(svc, A, c, armed);
    await expect(svc.release('seeker1', it.id)).rejects.toThrow('settle it in the extension');
    await svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 5, to: 'VERIFY', detail: { reason: 'page_closed' } });
    for (const to of ['CANCELLED', 'SKIPPED'])
      await expect(svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 6, to } as any)).rejects.toThrow('Cannot move');
    await expect(svc.release('seeker1', it.id)).rejects.toThrow('settle it in the extension');
    expect(app(prisma).status).toBe('EXTENSION_ACTIVE');
  });

  it('VERIFY needs a reason', async () => {
    const { prisma, svc } = setup();
    const c = await svc.claim(A, (await item(prisma, svc)).id);
    await drive(svc, A, c, armed);
    await expect(svc.transition(A, c.id, { attempt_id: c.attempt_id, seq: 5, to: 'VERIFY' })).rejects.toThrow('reason');
  });

  it('heartbeat extends the lease (also when armed, so VERIFY does not fire); wrong attempt or device is refused', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const c = await svc.claim(A, it.id);
    await drive(svc, A, c, armed);
    expireLease(prisma, it.id);
    await svc.heartbeat(A, it.id, c.attempt_id);
    await svc.recover('seeker1');
    expect(prisma.applyBatchItem.rows[0].state).toBe('AWAITING_SUBMIT');
    await expect(svc.heartbeat(A, it.id, 'old')).rejects.toThrow('Not the active attempt');
    await expect(svc.heartbeat(B, it.id, c.attempt_id)).rejects.toThrow('Not the active attempt');
  });

  it('heartbeat is rate limited per item', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    const c = await svc.claim(A, it.id);
    for (let i = 0; i < 6; i++) await svc.heartbeat(A, it.id, c.attempt_id);
    await expect(svc.heartbeat(A, it.id, c.attempt_id)).rejects.toThrow('Too many');
  });

  it('web release before arming frees the job; terminal items are untouched by recovery', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    await svc.claim(A, it.id);
    await svc.release('seeker1', it.id);
    expect(prisma.applyBatchItem.rows[0].state).toBe('CANCELLED');
    expect(app(prisma)).toBeUndefined();
    await svc.recover('seeker1');
    expect(prisma.applyBatchItem.rows[0].state).toBe('CANCELLED');
  });

  it('candidate data only for the device holding a live attempt', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    await expect(svc.assertWorking(A, it.id)).rejects.toThrow('Not the active attempt');
    await svc.claim(A, it.id);
    await expect(svc.assertWorking(A, it.id)).resolves.toBeDefined();
    await expect(svc.assertWorking(B, it.id)).rejects.toThrow('Not the active attempt');
  });
});

describe('VERIFY: the seeker is told once per attempt', () => {
  const toVerify = async (svc: any, prisma: any, p = A) => {
    const it = await item(prisma, svc);
    const c = await svc.claim(p, it.id);
    await drive(svc, p, c, armed);
    return { it, c };
  };

  it('entering VERIFY marks the application and notifies exactly once, whatever replays', async () => {
    const { prisma, svc, bus } = setup();
    const { it, c } = await toVerify(svc, prisma);
    const send = () => svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 5, to: 'VERIFY', detail: { reason: 'user_unsure' } });
    await send();
    expect(app(prisma)).toMatchObject({ status: 'EXTENSION_ACTIVE', verify_attempt: c.attempt_id, needs_input: { reason: 'verify_submission' } });
    expect(bus.publish).toHaveBeenCalledTimes(1);
    const [seeker, n] = bus.publish.mock.calls[0];
    expect(seeker).toBe('seeker1');
    expect(n).toMatchObject({ kind: 'application', status: 'VERIFY', tone: 'warning', id: `app:${app(prisma).id}:VERIFY:${c.attempt_id}` });
    await send(); // client retry of the same transition
    await svc.recover('seeker1'); // reconciliation sweeps
    await svc.list(A);
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('lease loss after arming also tells the seeker, once, even across repeated sweeps', async () => {
    const { prisma, svc, bus } = setup();
    const { it } = await toVerify(svc, prisma);
    expireLease(prisma, it.id);
    await svc.list(A);
    await svc.list(A);
    await svc.recover('seeker1');
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(app(prisma).needs_input).toMatchObject({ reason: 'verify_submission' });
  });

  it('settling clears the flag; a new attempt that lands in VERIFY is a new notification', async () => {
    const { prisma, svc, bus } = setup();
    const { it, c } = await toVerify(svc, prisma);
    await svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 5, to: 'VERIFY', detail: { reason: 'x' } });
    await svc.transition(B, it.id, { attempt_id: c.attempt_id, seq: 6, to: 'FAILED', detail: { failure_kind: 'not_submitted' } });
    expect(app(prisma)).toMatchObject({ status: 'FAILED', needs_input: null, verify_attempt: null });
    // retry: new claim, arm, VERIFY again
    const c2 = await svc.claim(A, (await prisma.applyBatchItem.create({ data: { batch_id: 'b2', job_seeker_id: 'seeker1', job_id: jobId(1), provider: 'workable' } })).id);
    expect(app(prisma).verify_attempt).toBeNull();
    await drive(svc, A, c2, armed);
    await svc.transition(A, c2.id, { attempt_id: c2.attempt_id, seq: 5, to: 'VERIFY', detail: { reason: 'y' } });
    expect(bus.publish).toHaveBeenCalledTimes(2);
    const ids = bus.publish.mock.calls.map((x: any) => x[1].id);
    expect(new Set(ids).size).toBe(2);
  });

  it('attesting from VERIFY clears needs_input and sends nothing more', async () => {
    const { prisma, svc, bus } = setup();
    const { it, c } = await toVerify(svc, prisma);
    await svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 5, to: 'VERIFY', detail: { reason: 'x' } });
    await svc.transition(B, it.id, { attempt_id: c.attempt_id, seq: 6, to: 'SUBMITTED_ATTESTED' });
    expect(app(prisma)).toMatchObject({ status: 'SUBMITTED', needs_input: null });
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('DTO shows the reason the client gave', async () => {
    const { prisma, svc } = setup();
    const { it, c } = await toVerify(svc, prisma);
    await svc.transition(A, it.id, { attempt_id: c.attempt_id, seq: 5, to: 'VERIFY', detail: { reason: 'page_closed' } });
    expect((await svc.list(A)).find((i: any) => i.id === it.id)!.verify_reason).toBe('page_closed');
  });
});

describe('a job held by an unlinked browser', () => {
  it('goes back to the queue so the browser linked now can take it, and is marked as not mine meanwhile', async () => {
    const { prisma, svc } = setup();
    const it = await item(prisma, svc);
    await svc.claim(A, it.id); // dev-A holds it, lease still valid
    const listB = await svc.list(B);
    expect(listB.find((x: any) => x.id === it.id)).toMatchObject({ state: 'CLAIMED', mine: false }); // A is still linked: B must not take it
    await prisma.extensionDevice.create({ data: { id: 'dev-A', job_seeker_id: 'seeker1', revoked_at: new Date(), expires_at: new Date(Date.now() + 1e9), idle_expires_at: new Date(Date.now() + 1e9) } });
    const after = await svc.list(B);
    expect(after.find((x: any) => x.id === it.id)).toMatchObject({ state: 'PENDING', mine: true });
  });
});
