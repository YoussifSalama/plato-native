import { ConflictException } from '@nestjs/common';
import { ResumeFileService } from './resume-file.service';

const p = { jobSeekerId: 'js1', deviceId: 'd1', scopes: [] } as any;

describe('ResumeFileService', () => {
  it('choose: the answer is kept in its own column (a state transition rewriting `detail` can never drop it)', async () => {
    let saved: any;
    const prisma: any = { applyBatchItem: { update: async (a: any) => (saved = a) } };
    const batches: any = { assertWorking: async () => ({ id: 'i1', detail: { last: { to: 'REVIEW' } } }) };
    const out = await new ResumeFileService(prisma, batches, {} as any, {} as any).choose(p, 'i1', 'tailored');
    expect(out).toEqual({ resume_choice: 'tailored' });
    expect(saved.data).toEqual({ resume_choice: 'tailored' });
  });

  it('file: nothing chosen yet is a conflict, never a guess', async () => {
    const batches: any = { assertWorking: async () => ({ id: 'i1', detail: null }) };
    await expect(new ResumeFileService({} as any, batches, {} as any, {} as any).file(p, 'i1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('file: tailored builds with the engine in auto mode for this job, named after it', async () => {
    let input: any;
    const prisma: any = { job: { findUniqueOrThrow: async () => ({ title: 'Engineer', company: 'Acme, Inc.', description: 'd', location: 'Cairo, Egypt' }) } };
    const batches: any = { assertWorking: async () => ({ id: 'i1', job_id: 'j1', detail: { resume_choice: 'tailored' } }) };
    const engine: any = { build: async (i: any) => ((input = i), { status: 'built', pdf: Buffer.from('%PDF-1.4 x') }) };
    const out = await new ResumeFileService(prisma, batches, engine, {} as any).file(p, 'i1');
    expect(input).toMatchObject({ jobSeekerId: 'js1', mode: 'auto', targetRole: 'Engineer', jobDescription: 'd', jobCountry: 'EG' });
    expect(out).toEqual({ name: 'Resume - Acme Inc - Engineer.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 x').toString('base64') });
  });

  it('file: the profile resume comes from object storage by its storage key', async () => {
    const prisma: any = { jobSeekerDocument: { findFirst: async () => ({ url: '/uploads/job-seeker-documents/abc-cv.pdf', name: 'Youssif CV.pdf', storage_key: 'docs/js1/abc-cv.pdf' }) } };
    const batches: any = { assertWorking: async () => ({ id: 'i1', job_id: 'j1', detail: { resume_choice: 'profile' } }) };
    let asked = '';
    const storage: any = { getObjectBuffer: async (k: string) => ((asked = k), Buffer.from('%PDF-1.4 y')) };
    const out = await new ResumeFileService(prisma, batches, {} as any, storage).file({ jobSeekerId: 'js1', deviceId: 'd1', scopes: [] } as any, 'i1');
    expect(asked).toBe('docs/js1/abc-cv.pdf');
    expect(out).toEqual({ name: 'Youssif CV.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 y').toString('base64') });
  });
});
