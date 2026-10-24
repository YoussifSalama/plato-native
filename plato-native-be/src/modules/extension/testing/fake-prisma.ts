/* eslint-disable */
// Tiny in-memory Prisma stand-in for tests. Each call is atomic (no awaits
// inside), like a single-document Mongo update, so races between two
// callers resolve the same way: one conditional update wins.
type Row = Record<string, any>;

const matchOne = (v: any, cond: any): boolean => {
  if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
  if (cond && typeof cond === 'object') {
    // Like Prisma on Mongo: a MISSING field is matched only by isSet:false.
    if ('isSet' in cond) return (v !== undefined) === cond.isSet;
    if ('not' in cond) return v !== undefined && v !== cond.not;
    if ('in' in cond) return cond.in.includes(v);
    if ('notIn' in cond) return !cond.notIn.includes(v);
    if ('gt' in cond) return v != null && v > cond.gt;
    if ('lt' in cond) return v != null && v < cond.lt;
    return false;
  }
  // `x: null` matches an explicit null only, never a missing field (Prisma on Mongo).
  return v === cond;
};
export const matches = (row: Row, where: Row = {}, uniques: string[][] = []): boolean =>
  Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w, uniques));
    const compound = uniques.find((u) => u.join('_') === k);
    if (compound) return compound.every((f) => (row[f] ?? null) === (cond as Row)[f]);
    return matchOne(row[k], cond);
  });

export function model(opts: { defaults?: () => Row; uniques?: string[][] } = {}) {
  const rows: Row[] = [];
  let n = 0;
  const uniques = opts.uniques ?? [];
  const find = (where: Row) => rows.filter((r) => matches(r, where, uniques));
  const api = {
    rows,
    create: async ({ data }: any) => {
      const row = { id: String(++n).padStart(24, '0'), created_at: new Date(), ...opts.defaults?.(), ...data };
      for (const u of uniques)
        if (rows.some((r) => u.every((f) => r[f] === row[f])))
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      rows.push(row);
      return row;
    },
    findUnique: async ({ where }: any) => find(where)[0] ?? null,
    findFirst: async ({ where }: any) => find(where)[0] ?? null,
    findMany: async ({ where }: any = {}) => find(where ?? {}),
    count: async ({ where }: any = {}) => find(where ?? {}).length,
    update: async ({ where, data }: any) => Object.assign(find(where)[0], data),
    updateMany: async ({ where, data }: any) => {
      const hit = find(where);
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    deleteMany: async ({ where }: any) => {
      const hit = find(where);
      hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { count: hit.length };
    },
  };
  return api;
}

export function fakePrisma() {
  const jobs = model();
  return {
    job: jobs,
    jobApplication: (() => {
      const m = model({
        defaults: () => ({ status: 'QUEUED', engine: null, updated_at: new Date() }),
        uniques: [['job_seeker_id', 'job_id']],
      });
      const find = m.findUnique;
      // `include: { job }` is the only include the code under test uses.
      m.findUnique = async (a: any) => {
        const row = await find(a);
        if (!row || !a.include?.job) return row;
        return { ...row, job: jobs.rows.find((j) => j.id === row.job_id) ?? { title: '', company: '' } };
      };
      return m;
    })(),
    applyBatch: model(),
    applyBatchItem: model({
      defaults: () => ({ state: 'PENDING', seq: 0, attempt_id: null, device_id: null, lease_expires_at: null, detail: null }),
    }),
    extensionPairing: model(),
    extensionDevice: model(),
  };
}
