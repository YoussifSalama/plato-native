import { RunContext } from '@openai/agents';
import {
  applyFilterTool,
  navigateTool,
  openJobTool,
  proposeApplyTool,
  removeFilterTool,
} from './orchestrator.tools';
import type {
  OrchestratorContext,
  OrchestratorEvent,
} from './orchestrator.context';

// The agent's UI tools only queue events for the client; check exactly what they queue.
it('navigation tools queue the events the client applies', async () => {
  const events: OrchestratorEvent[] = [];
  const ctx = new RunContext({ events } as unknown as OrchestratorContext);
  const call = (
    t: { invoke: (c: never, i: string) => Promise<unknown> },
    i: object,
  ) => t.invoke(ctx as never, JSON.stringify(i));

  await call(navigateTool, { page: 'jobs', tab: 'saved' });
  await call(navigateTool, { page: 'profile', tab: null });
  await call(openJobTool, { position: 2 });
  await call(applyFilterTool, {
    remoteType: 'REMOTE',
    jobType: null,
    level: 'senior',
    location: null,
    salaryMin: null,
    hasSalary: null,
    postedWithinDays: null,
    acceptsCountry: 'EG',
    salaryCurrencies: ['USD', 'EUR'],
    sort: 'newest',
    q: null,
  });
  await call(removeFilterTool, { keys: ['level'], all: false });
  await call(removeFilterTool, { keys: null, all: true });
  await call(proposeApplyTool, { positions: [1, 3], top: null });
  await call(proposeApplyTool, { positions: null, top: 10 });
  await call(proposeApplyTool, { positions: null, top: null });

  expect(events).toEqual([
    { type: 'navigate', page: 'jobs', tab: 'saved' },
    { type: 'navigate', page: 'profile' },
    { type: 'open_job', position: 2 },
    {
      type: 'apply_filter',
      filters: {
        remoteType: 'REMOTE',
        level: 'senior',
        acceptsCountry: 'EG',
        salaryCurrency: 'USD,EUR',
      },
      sort: 'newest',
    },
    { type: 'remove_filter', keys: ['level'] },
    { type: 'remove_filter', keys: 'all' },
    { type: 'propose_apply', positions: [1, 3] },
    { type: 'propose_apply', top: 10 },
  ]);
});
