/* eslint-disable */
import { ExtensionBatchService } from './batch.service';
import { decodeProofImage, PROOF_MAX_BYTES, PROOF_WINDOW_MS, ProofService } from './proof.service';
import { limiter } from './extension-auth.guard';
import { fakePrisma } from './testing/fake-prisma';

const A = { deviceId: 'dev-A', jobSeekerId: 'seeker1', scopes: [] };
const B = { deviceId: 'dev-B', jobSeekerId: 'seeker1', scopes: [] };
const OTHER = { deviceId: 'dev-C', jobSeekerId: 'seeker2', scopes: [] };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString('base64');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]).toString('base64');

const setup = async (steps: [string, any?][]) => {
  const prisma = fakePrisma();
  const batches = new ExtensionBatchService(prisma as any, { publish: jest.fn() } as any, { publish: jest.fn() } as any);
  batches.policy = () => 'FILL_ONLY';
  const storage = { putBuffer: jest.fn(async (k: string) => k) };
  const proofs = new ProofService(prisma as any, storage as any);
  const job = await prisma.job.create({ data: { source: 'WORKABLE', apply_url: null, url: 'https://x.test/1' } });
  job.id = '1'.repeat(24);
  const it = (await batches.createBatch('seeker1', [job.id])).items[0];
  const c = await batches.claim(A, it.id);
  let seq = 0;
  for (const [to, detail] of steps)
    await batches.transition(A, it.id, { attempt_id: c.attempt_id, seq: ++seq, to, detail } as any);
  const app = (): any => prisma.jobApplication.rows.find((a: any) => a.job_id === job.id);
  return { prisma, proofs, storage, id: it.id, app };
};
const submitted: [string, any?][] = [['PREPARING'], ['FILLING'], ['REVIEW'], ['AWAITING_SUBMIT'], ['SUBMITTED_CONFIRMED', { marker: 'Thank you' }]];

beforeEach(() => limiter['hits'].clear());

describe('proof of apply', () => {
  it('decodes PNG and JPEG (data URL ok), refuses anything else and > 5 MB', () => {
    expect(decodeProofImage(PNG).ext).toBe('png');
    expect(decodeProofImage(`data:image/jpeg;base64,${JPG}`)).toMatchObject({ ext: 'jpg', mime: 'image/jpeg' });
    expect(() => decodeProofImage(Buffer.from('GIF89a-not-allowed').toString('base64'))).toThrow('PNG or JPEG');
    expect(() => decodeProofImage('not base64 !!')).toThrow('base64');
    const big = Buffer.alloc(PROOF_MAX_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(() => decodeProofImage(big.toString('base64'))).toThrow('5 MB');
  });

  it('stores under proofs/<seeker>/<app>-<ts> and merges into evidence; a second upload replaces the key', async () => {
    const { proofs, storage, id, app } = await setup(submitted);
    const t1 = new Date();
    const r = await proofs.save(A, id, { image: JPG, url: 'https://jobs.x.test/thanks' }, t1);
    expect(r.screenshotKey).toBe(`proofs/seeker1/${app().id}-${t1.getTime()}.jpg`);
    expect(storage.putBuffer).toHaveBeenCalledWith(r.screenshotKey, expect.any(Buffer), 'image/jpeg');
    expect(app().evidence).toMatchObject({
      confirmed_by: 'page_marker', marker: 'Thank you', source: 'extension', // kept
      screenshotKey: r.screenshotKey, proofUrl: 'https://jobs.x.test/thanks', proofCapturedAt: t1.toISOString(),
    });
    const t2 = new Date(t1.getTime() + 1000);
    const again = await proofs.save(A, id, { image: PNG }, t2);
    expect(app().evidence).toMatchObject({ screenshotKey: again.screenshotKey, marker: 'Thank you' });
    expect(again.screenshotKey.endsWith(`-${t2.getTime()}.png`)).toBe(true);
  });

  it('refuses: not submitted yet, another seeker, another device, after the window', async () => {
    const early = await setup(submitted.slice(0, 4)); // AWAITING_SUBMIT
    await expect(early.proofs.save(A, early.id, { image: PNG })).rejects.toThrow('not submitted');
    const s = await setup(submitted);
    await expect(s.proofs.save(OTHER, s.id, { image: PNG })).rejects.toThrow('Item not found');
    await expect(s.proofs.save(B, s.id, { image: PNG })).rejects.toThrow('another device');
    await expect(s.proofs.save(A, s.id, { image: PNG }, new Date(Date.now() + PROOF_WINDOW_MS + 60_000))).rejects.toThrow('Too late');
    expect(s.storage.putBuffer).not.toHaveBeenCalled();
  });

  it('the submit itself keeps prior evidence fields but drops an old attempt\'s screenshot', async () => {
    const prisma = fakePrisma();
    const batches = new ExtensionBatchService(prisma as any, { publish: jest.fn() } as any, { publish: jest.fn() } as any);
    batches.policy = () => 'FILL_ONLY';
    const job = await prisma.job.create({ data: { source: 'WORKABLE', apply_url: null, url: 'u' } });
    job.id = '2'.repeat(24);
    await prisma.jobApplication.create({
      data: { job_seeker_id: 'seeker1', job_id: job.id, status: 'FAILED', evidence: { screenshotKey: 'apply-evidence/old.png', sent: [1] } },
    });
    const it = (await batches.createBatch('seeker1', [job.id])).items[0];
    const c = await batches.claim(A, it.id);
    let seq = 0;
    for (const [to, detail] of submitted)
      await batches.transition(A, it.id, { attempt_id: c.attempt_id, seq: ++seq, to, detail } as any);
    const ev = prisma.jobApplication.rows[0].evidence;
    expect(ev).toMatchObject({ sent: [1], confirmed_by: 'page_marker' });
    expect(ev.screenshotKey).toBeUndefined();
  });
});
