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
    const prisma: any = { applyBatch: { findUnique: async () => ({ search_id: null }) }, jobSeekerDocument: { findFirst: async () => ({ url: '/uploads/job-seeker-documents/abc-cv.pdf', name: 'Youssif CV.pdf', storage_key: 'docs/js1/abc-cv.pdf' }) } };
    const batches: any = { assertWorking: async () => ({ id: 'i1', batch_id: 'b1', job_id: 'j1', detail: { resume_choice: 'profile' } }) };
    let asked = '';
    const storage: any = { getObjectBuffer: async (k: string) => ((asked = k), Buffer.from('%PDF-1.4 y')) };
    const out = await new ResumeFileService(prisma, batches, {} as any, storage).file({ jobSeekerId: 'js1', deviceId: 'd1', scopes: [] } as any, 'i1');
    expect(asked).toBe('docs/js1/abc-cv.pdf');
    expect(out).toEqual({ name: 'Youssif CV.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 y').toString('base64') });
  });

  it('file: a search run with its own CV applies with that CV, not the profile one (and only the seeker\'s own)', async () => {
    let cvWhere: any;
    const prisma: any = {
      applyBatch: { findUnique: async () => ({ search_id: 'r1' }) },
      discoveryRun: { findUnique: async () => ({ query: { titles: ['PM'], cvId: 'cv1' } }) },
      searchCv: { findFirst: async (a: any) => ((cvWhere = a.where), { id: 'cv1', name: 'Product CV.pdf', storage_key: 'search-cvs/js1/pm.pdf' }) },
      jobSeekerDocument: { findFirst: jest.fn() },
    };
    const batches: any = { assertWorking: async () => ({ id: 'i1', batch_id: 'b1', job_id: 'j1', resume_choice: 'profile' }) };
    let asked = '';
    const storage: any = { getObjectBuffer: async (k: string) => ((asked = k), Buffer.from('%PDF-1.4 z')) };
    const out = await new ResumeFileService(prisma, batches, {} as any, storage).file(p, 'i1');
    expect(cvWhere).toEqual({ id: 'cv1', job_seeker_id: 'js1' });
    expect(prisma.jobSeekerDocument.findFirst).not.toHaveBeenCalled();
    expect(asked).toBe('search-cvs/js1/pm.pdf');
    expect(out.name).toBe('Product CV.pdf');
  });

  it('file: tailored and approved on the review screen for this job: that exact file, no new build', async () => {
    const prisma: any = {
      job: { findUniqueOrThrow: async () => ({ title: 'Engineer', company: 'Acme', description: 'd', location: null }) },
      careerResume: { findFirst: async (a: any) => (a.where.job_id === 'j1' && a.where.approved ? { storage_key: 'career-resumes/js1/r.pdf' } : null) },
    };
    const batches: any = { assertWorking: async () => ({ id: 'i1', job_id: 'j1', resume_choice: 'tailored' }) };
    const engine: any = { build: jest.fn() };
    const storage: any = { getObjectBuffer: async (k: string) => Buffer.from(k) };
    const out = await new ResumeFileService(prisma, batches, engine, storage).file(p, 'i1');
    expect(engine.build).not.toHaveBeenCalled();
    expect(out).toEqual({ name: 'Resume - Acme - Engineer.pdf', mime: 'application/pdf', data: Buffer.from('career-resumes/js1/r.pdf').toString('base64') });
  });
});
