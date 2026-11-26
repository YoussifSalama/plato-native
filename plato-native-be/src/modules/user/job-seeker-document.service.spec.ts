import { JobSeekerDocumentService } from './job-seeker-document.service';

// @nestjs/config ships as ESM, which this Jest setup does not load; StorageService only needs its type
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

const RETIRED = 'Retired: you deleted your CV';
type Doc = {
  id: string;
  job_seeker_id: string;
  type: string;
  status: string;
  processing_error: string | null;
  storage_key: string;
};
const cv = (id: string, extra: Partial<Doc> = {}): Doc => ({
  id,
  job_seeker_id: 's1',
  type: 'CV_RESUME',
  status: 'FAILED',
  processing_error: RETIRED,
  storage_key: `job-seeker-documents/s1/${id}.pdf`,
  ...extra,
});

// The documents collection and every collection that can point at a document or its file.
function setup(
  docs: Doc[],
  refs: {
    credentials?: string[]; // document_id of skill credentials
    careerKeys?: string[];
    resumeKeys?: string[];
    guestKeys?: string[];
  } = {},
) {
  const where = (w: Partial<Doc>) => (d: Doc) =>
    Object.entries(w).every(([k, v]) => d[k as keyof Doc] === v);
  const prisma = {
    jobSeekerDocument: {
      findMany: jest.fn(({ where: w }: { where: Partial<Doc> }) =>
        Promise.resolve(docs.filter(where(w))),
      ),
      count: jest.fn(
        ({
          where: w,
        }: {
          where: { storage_key: string; id: { not: string } };
        }) =>
          Promise.resolve(
            docs.filter(
              (d) => d.storage_key === w.storage_key && d.id !== w.id.not,
            ).length,
          ),
      ),
      delete: jest.fn(({ where: w }: { where: { id: string } }) => {
        docs.splice(
          docs.findIndex((d) => d.id === w.id),
          1,
        );
        return Promise.resolve({});
      }),
    },
    skillCredential: {
      count: jest.fn(({ where: w }: { where: { document_id: string } }) =>
        Promise.resolve(
          (refs.credentials ?? []).filter((x) => x === w.document_id).length,
        ),
      ),
    },
    careerResume: {
      count: jest.fn(({ where: w }: { where: { storage_key: string } }) =>
        Promise.resolve(
          (refs.careerKeys ?? []).filter((x) => x === w.storage_key).length,
        ),
      ),
    },
    jobApplication: {
      count: jest.fn(({ where: w }: { where: { resume_key: string } }) =>
        Promise.resolve(
          (refs.resumeKeys ?? []).filter((x) => x === w.resume_key).length,
        ),
      ),
    },
    guest: {
      count: jest.fn(({ where: w }: { where: { cv_storage_key: string } }) =>
        Promise.resolve(
          (refs.guestKeys ?? []).filter((x) => x === w.cv_storage_key).length,
        ),
      ),
    },
  };
  const storage = { delete: jest.fn(() => Promise.resolve()) };
  const svc = new JobSeekerDocumentService(prisma as never, storage as never);
  return { svc, storage, docs };
}

describe('JobSeekerDocumentService.purgeRetiredCvs (old CVs erased for good)', () => {
  it('a retired CV nothing points at: its file is deleted from storage, then its row', async () => {
    const { svc, storage, docs } = setup([
      cv('old1'),
      cv('live', { status: 'READY', processing_error: null }),
      cv('cert', { type: 'CERTIFICATE' }),
    ]);
    expect(await svc.purgeRetiredCvs('s1')).toBe(1);
    expect(storage.delete).toHaveBeenCalledWith(
      'job-seeker-documents/s1/old1.pdf',
    );
    expect(storage.delete).toHaveBeenCalledTimes(1);
    // the current CV and other kinds of documents are never touched
    expect(docs.map((d) => d.id)).toEqual(['live', 'cert']);
  });

  it('a retired CV something still points at is kept, file and row, and erased once free', async () => {
    const shared = 'job-seeker-documents/s1/shared.pdf';
    const docs = [
      cv('byCredential'),
      cv('byGuest', { storage_key: shared }),
      cv('byCareer', { storage_key: 'k-career' }),
      cv('byApplication', { storage_key: 'k-app' }),
    ];
    const first = setup(docs, {
      credentials: ['byCredential'],
      guestKeys: [shared],
      careerKeys: ['k-career'],
      resumeKeys: ['k-app'],
    });
    expect(await first.svc.purgeRetiredCvs('s1')).toBe(0);
    expect(first.storage.delete).not.toHaveBeenCalled();
    expect(docs).toHaveLength(4);
    // the references are gone: the next sweep (boot, or the next delete) erases them
    const later = setup(docs);
    expect(await later.svc.purgeRetiredCvs()).toBe(4);
    expect(docs).toHaveLength(0);
  });

  it('storage failing leaves the row retired for the next sweep', async () => {
    const { svc, storage, docs } = setup([cv('old1')]);
    storage.delete.mockRejectedValueOnce(new Error('R2 down'));
    Object.assign(svc, { logger: { warn: jest.fn() } });
    expect(await svc.purgeRetiredCvs('s1')).toBe(0);
    expect(docs.map((d) => d.id)).toEqual(['old1']);
    expect(await svc.purgeRetiredCvs('s1')).toBe(1);
    expect(docs).toHaveLength(0);
  });
});
