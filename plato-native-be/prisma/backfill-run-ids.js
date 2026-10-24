// One-off: populate discovery_run_ids from discovery_run_id, and credit
// duplicate runs (same thread, same titles, started within 5s) with the same
// matches so neither shows an empty result page.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const matches = await p.jobSeekerJobMatch.findMany({
    where: { discovery_run_ids: { isEmpty: true }, NOT: { discovery_run_id: null } },
    select: { id: true, discovery_run_id: true },
  });
  for (const m of matches) {
    await p.jobSeekerJobMatch.update({ where: { id: m.id }, data: { discovery_run_ids: [m.discovery_run_id] } });
  }
  console.log(`backfilled ${matches.length} matches`);

  const runs = await p.discoveryRun.findMany({ where: { status: 'DONE', NOT: { thread_id: null } }, orderBy: { started_at: 'asc' } });
  let credited = 0;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i], b = runs[j];
      const sameThread = a.thread_id === b.thread_id;
      const close = Math.abs(a.started_at - b.started_at) < 5000;
      const sameTitles = JSON.stringify(a.query?.titles) === JSON.stringify(b.query?.titles);
      if (!(sameThread && close && sameTitles)) continue;
      const owned = await p.jobSeekerJobMatch.findMany({ where: { discovery_run_ids: { has: a.id }, NOT: { discovery_run_ids: { has: b.id } } }, select: { id: true } });
      for (const m of owned) await p.jobSeekerJobMatch.update({ where: { id: m.id }, data: { discovery_run_ids: { push: b.id } } });
      const ownedB = await p.jobSeekerJobMatch.findMany({ where: { discovery_run_ids: { has: b.id }, NOT: { discovery_run_ids: { has: a.id } } }, select: { id: true } });
      for (const m of ownedB) await p.jobSeekerJobMatch.update({ where: { id: m.id }, data: { discovery_run_ids: { push: a.id } } });
      credited += owned.length + ownedB.length;
      console.log(`duplicates ${a.id} ~ ${b.id}: cross-credited ${owned.length + ownedB.length}`);
    }
  }
  console.log(`credited ${credited}`);
  await p.$disconnect();
})();
