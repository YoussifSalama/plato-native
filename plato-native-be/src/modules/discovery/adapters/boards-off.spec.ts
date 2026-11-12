import { JobSource } from '@prisma/client';

jest.mock('../apify.service', () => ({ ApifyService: class {} }));

it('DISABLED_BOARDS takes BOARD:COUNTRY to switch one market off', () => {
  process.env.DISABLED_BOARDS = 'DICE, GOOGLE_JOBS:EG';
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BoardsAdapter } =
      require('./boards.adapter') as typeof import('./boards.adapter');
    const a = new BoardsAdapter({} as never);
    const q = (countries: string[]) =>
      ({
        titles: ['Engineer'],
        locations: [],
        countries,
        remoteTypes: ['onsite'],
        willingToRelocate: false,
      }) as never;
    expect(a.sourcesFor(q(['EG']))).not.toContain(JobSource.GOOGLE_JOBS);
    expect(a.sourcesFor(q(['EG']))).toContain(JobSource.WUZZUF);
    expect(a.sourcesFor(q(['US']))).toContain(JobSource.GOOGLE_JOBS);
    expect(a.sourcesFor(q(['US']))).not.toContain(JobSource.DICE);
  });
  delete process.env.DISABLED_BOARDS;
});

it('caps runs per search and lets every market in before second titles', () => {
  process.env.DISABLED_BOARDS = '';
  process.env.BOARD_MAX_RUNS = '6';
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BoardsAdapter } =
      require('./boards.adapter') as typeof import('./boards.adapter');
    const plan = new BoardsAdapter({} as never).plan({
      titles: ['Backend Developer', 'Frontend Developer'],
      locations: [],
      countries: ['us', 'AE', 'EG', 'US'],
      remoteTypes: ['remote'],
      willingToRelocate: false,
    } as never);
    expect(plan).toHaveLength(6);
    // round-robin: US, AE, EG and the remote boards each get a run first
    expect(plan.slice(0, 4).map((r) => r.country)).toEqual([
      'US',
      'AE',
      'EG',
      'ANY',
    ]);
    expect(plan.every((r) => r.title === 'Backend Developer')).toBe(true);
  });
  delete process.env.BOARD_MAX_RUNS;
});
