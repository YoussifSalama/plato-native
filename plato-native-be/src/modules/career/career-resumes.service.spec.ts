// The engine, storage and profile loader pull ESM-only code this Jest setup does not load; none runs here.
jest.mock('../resume/resume-engine.service', () => ({
  ResumeEngine: class {},
}));
jest.mock('../documents/storage.service', () => ({ StorageService: class {} }));
jest.mock('../resume/resume-profile.service', () => ({
  ResumeProfileService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import { CareerResumesService } from './career-resumes.service';

const JOB = 'a'.repeat(24);
const profile = {
  summary: 'ERP consultant.',
  skills: ['SAP'],
  experiences: [
    {
      title: 'ERP Consultant',
      company: 'Inspire',
      start: null,
      end: null,
      description: null,
      technologies: [],
    },
  ],
};

function setup(
  over: { match?: unknown; existing?: unknown; build?: unknown } = {},
) {
  const created: any[] = [];
  const prisma: any = {
    jobSeeker: { findFirst: async () => ({ id: 's1' }) },
    jobSeekerJobMatch: {
      findFirst: async () =>
        'match' in over
          ? over.match
          : {
              job: {
                title: 'Presales Consultant',
                company: 'Mozn',
                description: 'Demos',
                location: 'Riyadh, Saudi Arabia',
              },
            },
    },
    careerResume: {
      findFirst: async () => over.existing ?? null,
      create: async (a: any) => (
        created.push(a.data),
        { id: 'r1', approved: false, ...a.data }
      ),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => ({})),
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  const engine: any = {
    build: jest.fn(
      async () =>
        over.build ?? {
          status: 'built',
          pdf: Buffer.from('%PDF'),
          doc: {
            summary: 'Presales consultant for applied AI.',
            experiences: profile.experiences,
          },
          strategy: {},
          checks: [],
          ats: { matched: ['Demos', 'SAP'] },
          gaps: [],
        },
    ),
  };
  const storage: any = { putBuffer: jest.fn(async () => 'k') };
  const profiles: any = { load: async () => profile };
  return {
    svc: new CareerResumesService(prisma, storage, engine, profiles),
    prisma,
    engine,
    storage,
    created,
  };
}

describe('CareerResumesService.forJob (Jobs → Tailor & apply)', () => {
  it('a job Plato never found for this seeker: 404, nothing built', async () => {
    const { svc, engine } = setup({ match: null });
    await expect(svc.forJob('u', JOB, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(engine.build).not.toHaveBeenCalled();
  });

  it('builds once in auto mode for the job, stores it with job_id, reports what changed', async () => {
    const { svc, engine, storage, created } = setup();
    const r = await svc.forJob('u', JOB, {});
    expect(engine.build).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'auto',
        targetRole: 'Presales Consultant',
        jobCountry: 'SA',
      }),
    );
    expect(storage.putBuffer).toHaveBeenCalled();
    expect(created[0]).toMatchObject({
      job_id: JOB,
      title: 'Presales Consultant · Mozn',
      version: 1,
    });
    expect(r).toMatchObject({ status: 'built', job_id: JOB });
    expect((r as any).changes.map((c: any) => c.section)).toEqual([
      'summary',
      'keywords',
    ]);
  });

  it('already made for this job: returned as is, no second build (no second charge)', async () => {
    const { svc, engine } = setup({
      existing: {
        id: 'r0',
        job_id: JOB,
        title: 't',
        approved: true,
        version: 1,
        doc: null,
        strategy: null,
      },
    });
    expect(await svc.forJob('u', JOB, {})).toMatchObject({
      id: 'r0',
      approved: true,
    });
    expect(engine.build).not.toHaveBeenCalled();
  });

  it('skill gaps come back to the review screen to answer', async () => {
    const { svc } = setup({
      build: { status: 'needs_input', kind: 'skill_gaps', gaps: ['Python'] },
    });
    expect(await svc.forJob('u', JOB, {})).toEqual({
      status: 'gaps',
      job_id: JOB,
      job: { title: 'Presales Consultant', company: 'Mozn' },
      gaps: ['Python'],
    });
  });
});

describe('CareerResumesService.approve', () => {
  it('a resume made for a job: only that job’s other versions are unapproved', async () => {
    const { svc, prisma } = setup();
    prisma.careerResume.findFirst = async () => ({
      id: 'r1',
      job_seeker_id: 's1',
      target_role: 'Presales Consultant',
      job_id: JOB,
    });
    await svc.approve('u', 'r1');
    expect(prisma.careerResume.updateMany).toHaveBeenCalledWith({
      where: { job_seeker_id: 's1', job_id: JOB },
      data: { approved: false },
    });
  });

  it('a role resume: other role resumes only, never a job’s', async () => {
    const { svc, prisma } = setup();
    prisma.careerResume.findFirst = async () => ({
      id: 'r2',
      job_seeker_id: 's1',
      target_role: 'ERP',
      job_id: null,
    });
    await svc.approve('u', 'r2');
    expect(prisma.careerResume.updateMany.mock.calls[0][0].where).toMatchObject(
      {
        target_role: 'ERP',
        OR: [{ job_id: null }, { job_id: { isSet: false } }],
      },
    );
  });
});
