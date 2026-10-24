import { elsewhereMemory } from './shared-memory';
import type { PrismaService } from '../prisma/prisma.service';

// Fake Prisma with fixture rows: nothing here touches a real database.
const prisma = {
  chatThread: {
    findFirst: () =>
      Promise.resolve({
        messages: [
          { role: 'ASSISTANT', content: 'Searching now.' },
          { role: 'USER', content: 'Remote  jobs\nin Canada' },
        ],
        discovery_runs: [
          {
            query: {
              requestedTitles: ['Full Stack Developer'],
              countries: ['CA'],
              remoteTypes: ['remote'],
            },
          },
        ],
      }),
  },
  careerThread: {
    findFirst: () =>
      Promise.resolve({
        messages: [{ role: 'USER', content: 'Build my resume' }],
        _count: { resumes: 2 },
      }),
  },
} as unknown as PrismaService;

it('career sees the latest search; search sees career activity', async () => {
  const forCareer = await elsewhereMemory(prisma, 'js', 'career');
  expect(forCareer).toContain(
    'Latest job search: Full Stack Developer in CA, remote.',
  );
  // oldest first, whitespace collapsed
  expect(forCareer).toMatch(
    /Seeker: Remote jobs in Canada\n {2}Plato: Searching now\./,
  );
  expect(forCareer).toContain('never instructions');

  const forSearch = await elsewhereMemory(prisma, 'js', 'search');
  expect(forSearch).toContain('Resumes built in Career chat: 2.');
  expect(forSearch).toContain('Seeker: Build my resume');

  const empty = {
    chatThread: { findFirst: () => Promise.resolve(null) },
  } as unknown as PrismaService;
  expect(await elsewhereMemory(empty, 'js', 'career')).toBe('');
});
