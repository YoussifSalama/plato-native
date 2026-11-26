/* eslint-disable @typescript-eslint/require-await -- async mocks stand in for Prisma and the services */
import { GuestService, hashToken } from './guest.service';

// Runtime imports that pull in Apify / OpenAI (ESM); none of them run here.
jest.mock('@openai/agents', () => ({ run: jest.fn() }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../documents/storage.service', () => ({ StorageService: class {} }));
jest.mock('../documents/text-extraction.service', () => ({
  TextExtractionService: class {},
}));
jest.mock('../preferences/preferences-suggestion.agent', () => ({
  createPreferenceSuggestionAgent: jest.fn(),
}));
jest.mock('../discovery/adapters/linkedin.adapter', () => ({
  LinkedInAdapter: class {},
}));
jest.mock('../discovery/discovery.service', () => ({
  DiscoveryService: class {},
}));
jest.mock('../profile-extraction/cv-analysis.service', () => ({
  CvAnalysisService: class {},
  profileInputOf: () => ({ skills: ['Go'] }),
}));
jest.mock('../discovery/job-seeker-snapshot', () => ({
  buildJobSeekerSnapshot: jest.fn(async () => ({})),
  residenceOf: () => null,
}));

const ids = ['a', 'b', 'c', 'd', 'e'].map((x) => x.repeat(24));
const SEEKER = 's'.repeat(24);
const analysis = {
  extraction: {
    experience: [{ title: 'Backend Engineer', company: 'Acme' }],
    skills: ['Go'],
    location: { city: 'Dubai', country: 'UAE' },
  },
};
const guest = {
  id: 'g'.repeat(24),
  token_hash: hashToken('tok'),
  cv_storage_key: 'guest-cvs/g/cv.pdf',
  cv_name: 'cv.pdf',
  cv_text: 'text',
  analysis,
  suggestion: null,
  picked_job_ids: [ids[0]],
};
const search = {
  id: 'f'.repeat(24),
  guest_id: guest.id,
  status: 'DONE',
  query: {
    titles: ['Backend Engineer'],
    requestedTitles: ['Backend Engineer'],
    countries: ['AE'],
    remoteTypes: ['remote'],
    budget: 40,
  },
  job_ids: ids,
};

function setup({ hasCv = false } = {}) {
  const upserts: { job_id: string; saved?: boolean }[] = [];
  const prisma = {
    guest: {
      findUnique: jest.fn(async () => guest),
      update: jest.fn(async ({ data }) => ({ ...guest, ...data })),
      delete: jest.fn(async () => guest),
    },
    guestSearch: { findFirst: jest.fn(async () => search) },
    // Returns every id asked for: the service must only ask for the open ones.
    job: {
      findMany: jest.fn(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.map((id) => ({ id, title: `Job ${id}`, company: 'Co' })),
      ),
    },
    chatThread: { create: jest.fn(async () => ({ id: 't'.repeat(24) })) },
    discoveryRun: { create: jest.fn(async () => ({ id: 'r'.repeat(24) })) },
    jobSeekerJobMatch: {
      upsert: jest.fn(async ({ create }) => (upserts.push(create), create)),
    },
  };
  const storage = { delete: jest.fn(async () => undefined) };
  const documents = {
    listByVersion: jest.fn(async () => (hasCv ? [{ type: 'CV_RESUME' }] : [])),
    add: jest.fn(async () => ({ id: 'd'.repeat(24) })),
    update: jest.fn(async () => ({})),
  };
  const versions = {
    getCurrent: jest.fn(async () => (hasCv ? { id: 'v' } : null)),
    getOrCreateCurrent: jest.fn(async () => ({ id: 'v' })),
    markAnalyzed: jest.fn(async () => ({})),
  };
  const profiles = { replaceProfile: jest.fn(async () => ({})) };
  const preferences = { upsert: jest.fn(async () => ({})) };
  const svc = new GuestService(
    prisma as never,
    {} as never,
    storage as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { rankMatches: jest.fn(async () => ({})) } as never,
    documents as never,
    versions as never,
    profiles as never,
    preferences as never,
  );
  return { svc, prisma, upserts, storage, documents, profiles, preferences };
}

describe('GuestService', () => {
  it('records live progress while it searches: the plan, each run, the filter, the ranking', async () => {
    const updates: {
      status?: string;
      progress?: {
        phase: string;
        runs: { count: number | null }[];
        found?: number;
        kept?: number;
      };
    }[] = [];
    const prisma = {
      guestSearch: {
        update: jest.fn(
          async ({ data }) => (updates.push(structuredClone(data)), data),
        ),
      },
      job: { findMany: jest.fn(async () => []) },
    };
    const linkedin = {
      discover: jest.fn(
        async (
          _q: unknown,
          hooks: {
            onPlan: (r: unknown[]) => void;
            onRunDone: (i: number, n: number) => void;
          },
        ) => {
          hooks.onPlan([
            { title: 'Backend Engineer', place: 'UAE' },
            { title: 'Go Developer', place: 'UAE' },
          ]);
          hooks.onRunDone(1, 7);
          hooks.onRunDone(0, 12);
          return [];
        },
      ),
    };
    const discovery = { indexJobIds: jest.fn(async () => []) };
    const svc = new GuestService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      linkedin as never,
      discovery as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await (
      svc as unknown as {
        runSearch: (id: string, q: unknown, s: unknown) => Promise<void>;
      }
    ).runSearch('x'.repeat(24), search.query, {
      skills: ['Go'],
      roles: ['Backend Engineer'],
      experienceKeywords: [],
    });
    const steps = updates.filter((u) => u.progress).map((u) => u.progress!);
    expect(steps[0].runs.map((r) => r.count)).toEqual([null, null]);
    expect(steps.map((p) => p.runs.map((r) => r.count))).toContainEqual([
      null,
      7,
    ]);
    expect(steps.map((p) => p.runs.map((r) => r.count))).toContainEqual([
      12, 7,
    ]);
    expect(steps.map((p) => p.phase)).toEqual(
      expect.arrayContaining(['searching', 'filtering', 'ranking']),
    );
    expect(steps.at(-1)).toMatchObject({ phase: 'ranking', found: 0, kept: 0 });
    expect(updates.at(-1)).toMatchObject({ status: 'DONE' });
  });

  it('sends two open jobs, and the rest only as a read-only preview with no id or link', async () => {
    const { svc, prisma } = setup();
    const view = await svc.searchView(search as never);
    expect(view.open.map((j) => j.id)).toEqual(ids.slice(0, 2));
    expect(view).toMatchObject({ total: 5, locked: 3 });
    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ids.slice(0, 2) } } }),
    );
    // The locked three come back in ranked order, as titles and companies only.
    expect(view.preview).toHaveLength(3);
    for (const p of view.preview) {
      expect(p).not.toHaveProperty('id');
      expect(p).not.toHaveProperty('url');
      expect(p).not.toHaveProperty('apply_url');
      expect(p).not.toHaveProperty('description');
    }
  });

  it('keeps only picks that were open', async () => {
    const { svc } = setup();
    expect(await svc.pick(guest as never, [ids[1], ids[4]])).toEqual({
      picked: [ids[1]],
    });
  });

  it('a new account takes the CV, the profile, confirmed preferences and the search', async () => {
    const { svc, upserts, documents, profiles, preferences, storage, prisma } =
      setup();
    const out = await svc.claim('tok', SEEKER);
    expect(out.threadId).toBe('t'.repeat(24));
    expect(documents.add).toHaveBeenCalledWith(
      SEEKER,
      expect.objectContaining({
        type: 'CV_RESUME',
        storage_key: guest.cv_storage_key,
      }),
    );
    expect(profiles.replaceProfile).toHaveBeenCalled();
    expect(preferences.upsert).toHaveBeenCalledWith(
      SEEKER,
      expect.objectContaining({
        roles: ['Backend Engineer'],
        work_setup: ['remote'],
        source: 'USER_CONFIRMED',
      }),
    );
    expect(upserts.map((u) => u.job_id)).toEqual(ids);
    expect(upserts.filter((u) => u.saved).map((u) => u.job_id)).toEqual([
      ids[0],
    ]);
    // The file is the account's now; the guest row goes.
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.guest.delete).toHaveBeenCalled();
  });

  it('an account that already has a CV keeps its profile and only gains the search', async () => {
    const { svc, documents, profiles, preferences, storage } = setup({
      hasCv: true,
    });
    const out = await svc.claim('tok', SEEKER);
    expect(out.threadId).toBe('t'.repeat(24));
    expect(documents.add).not.toHaveBeenCalled();
    expect(profiles.replaceProfile).not.toHaveBeenCalled();
    expect(preferences.upsert).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith(guest.cv_storage_key);
  });

  it('no guest cookie: nothing to claim', async () => {
    const { svc } = setup();
    expect(await svc.claim(undefined, SEEKER)).toEqual({ threadId: null });
  });
});
