import { SkillsService } from './skills.service';

// Fake prisma + profile service with fixture rows: nothing touches a real database.
function setup(verifyHtml: string) {
  const created: Record<string, unknown[]> = {
    cert: [],
    evidence: [],
    skills: [],
  };
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    jobSeeker: {
      findUnique: () =>
        Promise.resolve({
          id: 's1',
          skills: ['React'],
          user: { full_name: 'Youssif Salama' },
        }),
      update: ({ data }: { data: unknown }) => (
        created.skills.push(data),
        Promise.resolve({})
      ),
    },
    skillCredential: {
      create: ({ data }: { data: Record<string, unknown> }) => (
        rows.set('c1', { id: 'c1', verification: 'SELF_REPORTED', ...data }),
        Promise.resolve({ id: 'c1' })
      ),
      findUniqueOrThrow: () => Promise.resolve(rows.get('c1')),
      update: ({ data }: { data: Record<string, unknown> }) => (
        rows.set('c1', { ...rows.get('c1'), ...data }),
        Promise.resolve(rows.get('c1'))
      ),
    },
    jobSeekerCertification: {
      findFirst: () => Promise.resolve(null),
      create: ({ data }: { data: unknown }) => (
        created.cert.push(data),
        Promise.resolve({})
      ),
    },
    jobSeekerSkillEvidence: { findUnique: () => Promise.resolve(null) },
  };
  const profiles = {
    upsertSkillEvidence: (_: string, d: unknown) => (
      created.evidence.push(d),
      Promise.resolve({})
    ),
  };
  const original = global.fetch;
  global.fetch = (() => Promise.resolve(new Response(verifyHtml))) as never;
  return {
    service: new SkillsService(prisma as never, profiles as never),
    created,
    restore: () => (global.fetch = original),
  };
}

const dto = {
  skill: 'Power BI',
  courseId: 'microsoft-pl-300',
  status: 'COMPLETED' as const,
  credentialUrl: 'https://www.credly.com/badges/abc',
};

it('a completed course whose link checks out is added to the profile, once', async () => {
  const { service, created, restore } = setup(
    '<meta content="Youssif Salama earned Power BI Data Analyst Associate (PL-300)">',
  );
  try {
    const row = (await service.addCredential('u1', dto)) as unknown as Record<
      string,
      unknown
    >;
    expect(row.verification).toBe('VERIFIED');
    expect(created.cert).toHaveLength(1);
    expect(created.evidence[0]).toMatchObject({
      skill: 'Power BI',
      level: 'WORKING',
    });
    // the skill joins the profile's list used for matching; React was already there
    expect(created.skills).toEqual([{ skills: { push: 'Power BI' } }]);
  } finally {
    restore();
  }
});

it('self-reported or unreadable links never reach the profile', async () => {
  const { service, created, restore } = setup('<div id="root"></div>');
  try {
    const spa = (await service.addCredential('u1', dto)) as unknown as Record<
      string,
      unknown
    >;
    expect(spa.verification).toBe('SELF_REPORTED');
    const noLink = (await service.addCredential('u1', {
      ...dto,
      credentialUrl: undefined,
    })) as unknown as Record<string, unknown>;
    expect(noLink.verification_note).toContain('public link');
    const inProgress = await service.addCredential('u1', {
      ...dto,
      status: 'IN_PROGRESS',
    });
    expect(inProgress).toBeTruthy();
    expect(created.cert).toHaveLength(0);
    expect(created.evidence).toHaveLength(0);
  } finally {
    restore();
  }
});
