import {
  run,
  Usage,
  type AgentInputItem,
  type Model,
  type ModelRequest,
  type ModelResponse,
  type Tool,
} from '@openai/agents';
import { createOrchestratorAgent, type LiveStatus } from './orchestrator.agent';
import type {
  OrchestratorContext,
  OrchestratorEvent,
} from './orchestrator.context';
import { careerTools, type CareerDeps } from '../career/career.agent';
import type { JobSeekerSnapshot } from '../discovery/job-seeker-snapshot';

// One Plato AI: the career tools live in the orchestrator itself, so a career
// request and a page action are handled by the same agent in one conversation.
// A scripted model stands in for the LLM: it picks the tool a real model would.

const snapshot = {
  skills: [],
  roles: ['Frontend Developer'],
  preferredIndustries: [],
  preferredLocations: [],
  workSetup: [],
  jobTypes: [],
  experienceKeywords: [],
  seniority: null,
  experiences: [],
  yearsExperience: null,
  willingToRelocate: false,
  visaSponsorshipRequired: false,
  residenceCountry: 'EG',
  employmentStatus: null,
  salary: { min: null, currency: null, period: 'MONTHLY' as const },
} as unknown as JobSeekerSnapshot;

const live: LiveStatus = {
  thread: { id: 't1', title: 'New search' },
  latestRun: null,
  results: null,
  searches: [],
  othersRunning: [],
  ui: { page: 'jobs' },
};

const textOf = (item: AgentInputItem | undefined) =>
  item &&
  'role' in item &&
  item.role === 'user' &&
  typeof item.content === 'string'
    ? item.content
    : '';

// Which tool the "model" calls for each request, then a one-line reply.
const PLAN: [RegExp, string, object][] = [
  [
    /tailor my resume/i,
    'build_resume',
    {
      targetRole: 'Frontend Developer',
      market: null,
      jobDescription: 'React, TypeScript',
      template: null,
      careerChanger: false,
    },
  ],
  [/apply to/i, 'propose_apply', { positions: [1], top: null }],
  [/applications/i, 'open_path', { path: '/applications', more: false }],
];

class ScriptedModel implements Model {
  toolNames: string[][] = [];
  private n = 0;
  getResponse(req: ModelRequest): Promise<ModelResponse> {
    this.toolNames.push(req.tools.map((t) => t.name));
    const input = req.input as AgentInputItem[];
    const last = input.at(-1);
    const usage = new Usage({ requests: 1, inputTokens: 10, outputTokens: 5 });
    if (last && 'type' in last && last.type === 'function_call_result')
      return Promise.resolve({
        usage,
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Done.' }],
          },
        ],
      });
    const said = textOf(
      [...input].reverse().find((i) => 'role' in i && i.role === 'user'),
    );
    const [, name, args] = PLAN.find(([re]) => re.test(said))!;
    return Promise.resolve({
      usage,
      output: [
        {
          type: 'function_call',
          callId: `c${++this.n}`,
          name,
          arguments: JSON.stringify(args),
          status: 'completed',
        },
      ],
    });
  }
  getStreamedResponse(): AsyncIterable<never> {
    throw new Error('not used');
  }
}

it('routes career and page requests through one agent, in one conversation', async () => {
  const model = new ScriptedModel();
  const buildResume = jest.fn().mockResolvedValue({ built: true });
  const deps = { buildResume } as unknown as CareerDeps;
  const events: OrchestratorEvent[] = [];
  const context = { events } as unknown as OrchestratorContext;
  const agent = createOrchestratorAgent(
    model as unknown as string,
    { firstName: 'Sara', snapshot },
    live,
    '',
    careerTools(deps) as Tool<OrchestratorContext>[],
  );

  const history: AgentInputItem[] = [];
  for (const said of [
    'Tailor my resume to the Acme frontend job',
    'Now apply to it',
    'Take me to my applications',
  ]) {
    history.push({ role: 'user', content: said });
    const result = await run(agent, history, { context });
    history.push({
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: String(result.finalOutput) }],
    });
  }

  // The career request reached the resume engine's tool…
  expect(buildResume).toHaveBeenCalledWith(
    expect.objectContaining({ targetRole: 'Frontend Developer' }),
  );
  // …and the apply and navigation requests still used the page tools.
  expect(events).toEqual([
    { type: 'propose_apply', positions: [1] },
    { type: 'goto', path: '/applications', more: false },
  ]);
  // One agent carries both kinds of tool, once each (no duplicate get_plato_tokens).
  const tools = model.toolNames[0];
  expect(tools).toEqual(
    expect.arrayContaining([
      'build_resume',
      'score_resume',
      'open_path',
      'click_element',
    ]),
  );
  expect(tools.filter((t) => t === 'get_plato_tokens')).toHaveLength(1);
});
