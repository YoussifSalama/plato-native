import { NotFoundException } from '@nestjs/common';
import { SearchesService } from './searches.service';

const run = (id: string, featured: boolean | null, title: string) => ({
  id,
  featured,
  matched: 3,
  started_at: new Date(),
  query: { requestedTitles: [title], locations: ['Cairo'] },
});

describe('SearchesService', () => {
  it('lists searches holding jobs added from Plato first, then newest; featured is only a tag', async () => {
    const prisma: any = {
      discoveryRun: { findMany: async () => [run('a', null, 'New'), run('b', true, 'Starred'), run('c', null, 'Old')] },
      jobSeekerJobMatch: { findMany: async () => [{ discovery_run_id: 'c', discovery_run_ids: [] }] },
    };
    const out = await new SearchesService(prisma, {} as any).list('s1');
    expect(out.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(out[0]).toMatchObject({ title: 'Old', queued: 1 });
    expect(out.find((x) => x.id === 'b')!.featured).toBe(true);
  });

  it("refuses another seeker's search", async () => {
    const prisma: any = { discoveryRun: { findFirst: async () => null, updateMany: async () => ({ count: 0 }) } };
    const s = new SearchesService(prisma, {} as any);
    await expect(s.jobs('s1', 'a'.repeat(24))).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.setFeatured('s1', 'a'.repeat(24), true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delegates filtering to the same engine as the web, scoped to this search', async () => {
    let call: any;
    const prisma: any = {
      discoveryRun: { findFirst: async () => ({ id: 'r' }) },
      jobSeekerJobMatch: { findMany: async (a: any) => (a.where.extension_queued ? [{ job: { id: 'jq', source: 'GREENHOUSE', url: 'https://x', apply_url: null } }] : [{ job: { source: 'LEVER' } }, { job: { source: 'LEVER' } }, { job: { source: 'GREENHOUSE' } }]) },
    };
    const discovery: any = {
      referenceScore: async () => 1,
      getMatches: async (_id: string, a: any) => ((call = a), { total: 1, items: [{ extension_queued: true, match_score: 0.9, job: { id: 'j1', title: 'Dev', company: 'Acme', location: null, source: 'LEVER', apply_url: null, url: 'https://x.test', applications: [] } }] }),
    };
    const id = 'a'.repeat(24);
    const out = await new SearchesService(prisma, discovery).jobs('s1', id, { q: 'react', sort: 'newest', skip: 0, take: 8 });
    expect(call.filters).toMatchObject({ q: 'react', sort: 'newest', tab: 'discover', runIds: [id] });
    expect(call.shortlistedOnly).toBe(true);
    expect(out.total).toBe(1);
    expect(out.items[0]).toMatchObject({ id: 'j1', queued: true });
    expect(out.queued).toEqual(['jq']);
    expect(out.sources).toEqual([{ value: 'LEVER', count: 2 }, { value: 'GREENHOUSE', count: 1 }]);
  });
});

describe('ticked jobs first', () => {
  it('lists the ticked jobs before the rest and keeps paging right', async () => {
    const A = 'a'.repeat(24), B = 'b'.repeat(24);
    const job = (id: string) => ({ id, title: id.slice(0, 1), company: 'C', location: null, source: 'LEVER', apply_url: null, url: 'https://x', applications: [] });
    let restCall: any;
    const prisma: any = {
      discoveryRun: { findFirst: async () => ({ id: 'r' }) },
      jobSeekerJobMatch: { findMany: async (a: any) => (a.where.job_id ? [{ job_id: B, match_score: 1, job: job(B) }, { job_id: A, match_score: 1, job: job(A) }] : []) },
    };
    const discovery: any = { referenceScore: async () => 1, getMatches: async (_s: string, a: any) => ((restCall = a), { total: 10, items: Array.from({ length: a.take }, (_, i) => ({ match_score: 1, job: job(String(i).padStart(24, 'c')) })) }) };
    const svc = new SearchesService(prisma, discovery);
    const p1 = await svc.jobs('s1', 'd'.repeat(24), { skip: 0, take: 6, first: `${A},${B}` });
    expect(p1.items.slice(0, 2).map((j) => j.id)).toEqual([A, B]); // in the order they were ticked
    expect(p1.total).toBe(12);
    expect(restCall).toMatchObject({ skip: 0, take: 4, filters: { excludeJobIds: [A, B] } });
    await svc.jobs('s1', 'd'.repeat(24), { skip: 6, take: 6, first: `${A},${B}` });
    expect(restCall).toMatchObject({ skip: 4, take: 6 }); // page 2 continues the rest where page 1 stopped
  });
});
