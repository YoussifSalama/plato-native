import { Agent, run, tool, type AgentInputItem } from '@openai/agents';
import { z } from 'zod';
import { metered } from '../usage/usage';
import {
  ApplyRunState,
  buildApplyOrchestratorInstructions,
} from './apply-orchestrator.prompt';

// What the agent asked the panel to do this turn. The agent has no power over a
// page or the server: the extension panel shows/executes these, and only these.
export type OrchestratorEvent =
  | { type: 'report'; text: string }
  | { type: 'ask'; jobId: string | null; question: string; choices: string[] }
  | { type: 'account'; jobId: string; site: string; reason: string }
  | { type: 'skip'; jobId: string; reason: string }
  | { type: 'pause'; reason: string }
  | { type: 'fill'; jobId: string; field: string; value: string }
  | { type: 'resume' }
  | { type: 'attach_resume'; jobId: string } // upload the seeker's resume into that job's form
  | { type: 'retry'; jobId: string } // run the worker on that job again
  | { type: 'submit'; jobId: string } // the seeker asked, in this chat, to submit that job: the extension presses Submit
  | { type: 'refresh' }; // the queue or settings changed on the server: reload

export interface OrchestratorTurn {
  message: string | null;
  history: { role: 'user' | 'assistant'; content: string }[];
}

const id = z.string().min(1).max(64);

export interface QueueActions {
  narrowQueue(d: { minMatch?: number; companies?: string[] }): Promise<{ dropped: number; companies: string[] }>;
  updateSettings(p: { autoSubmit?: boolean; coverLetter?: boolean; speed?: 'careful' | 'smart' | 'fast'; customMessage?: string }): Promise<unknown>;
}

function tools(events: OrchestratorEvent[], jobIds: Set<string>, fields: Map<string, string[]>, act?: QueueActions) {
  // A job id the agent makes up is dropped, never forwarded.
  const known = (j: string) => jobIds.has(j);
  return [
    tool({
      name: 'report',
      description: 'Post a short progress update to the seeker.',
      parameters: z.object({ text: z.string().min(1).max(400) }),
      execute: async ({ text }) => {
        events.push({ type: 'report', text });
        return 'sent';
      },
    }),
    tool({
      name: 'ask_seeker',
      description:
        'Ask the seeker ONE question and wait. jobId null = the question applies to all blocked jobs. choices = the field\'s own options only (select/radio); for a free-text field pass [] and never say "choose".',
      parameters: z.object({
        jobId: id.nullable(),
        question: z.string().min(1).max(400),
        choices: z.array(z.string().min(1).max(60)).max(6),
      }),
      execute: async ({ jobId, question, choices }) => {
        if (jobId && !known(jobId)) return 'unknown job';
        // no options to pick from: "please choose one" makes no sense to the seeker
        if (!choices.length) question = question.replace(/\s*please choose one\.?/i, '').trim();
        events.push({ type: 'ask', jobId, question, choices });
        return 'asked; wait for the answer';
      },
    }),
    tool({
      name: 'request_account',
      description:
        'Ask the seeker to create or sign in to an account on a site themselves.',
      parameters: z.object({
        jobId: id,
        site: z.string().min(1).max(80),
        reason: z.string().min(1).max(200),
      }),
      execute: async ({ jobId, site, reason }) => {
        if (!known(jobId)) return 'unknown job';
        events.push({ type: 'account', jobId, site, reason });
        return 'asked';
      },
    }),
    tool({
      name: 'skip_job',
      description: 'Stop one job for good, ONLY when the seeker asked to skip it (or the posting is closed / already applied). Never for a page that is slow, did not load or needs a retry: suggest Try again instead.',
      parameters: z.object({ jobId: id, reason: z.string().min(1).max(200) }),
      execute: async ({ jobId, reason }) => {
        if (!known(jobId)) return 'unknown job';
        events.push({ type: 'skip', jobId, reason });
        return 'skipped';
      },
    }),
    tool({
      name: 'fill_field',
      description:
        "Put the seeker's own answer into one field of a blocked job. ONLY a value the seeker typed or chose in this chat, or a fact from the profile. field is the field's label exactly as listed in the blocked job.",
      parameters: z.object({
        jobId: id,
        field: z.string().min(1).max(300),
        value: z.string().min(1).max(2000),
      }),
      execute: async ({ jobId, field, value }) => {
        if (!known(jobId)) return 'unknown job';
        // the label must be one of this job's empty required fields (exact, or one clearly contains the other)
        const labels = fields.get(jobId) ?? [];
        const want = field.trim().toLowerCase();
        const hit = labels.find((l) => l.toLowerCase() === want) ?? labels.find((l) => l.toLowerCase().includes(want) || want.includes(l.toLowerCase()));
        if (labels.length && !hit) return `unknown field. The fields of this job are: ${labels.map((l) => `"${l}"`).join('; ')}`;
        events.push({ type: 'fill', jobId, field: hit ?? field, value });
        return 'sent to the form; the extension fills it and checks the page (do not say it is done)';
      },
    }),
    tool({
      name: 'attach_resume',
      description: "Upload the seeker's resume (the profile's, or one built for the job, per their setting) into this job's resume field. The extension does it in the tab.",
      parameters: z.object({ jobId: id }),
      execute: async ({ jobId }) => {
        if (!known(jobId)) return 'unknown job';
        events.push({ type: 'attach_resume', jobId });
        return 'the extension is uploading the resume and continuing the job (do not say it is done)';
      },
    }),
    tool({
      name: 'submit_job',
      description: "Press Submit on this job's form. ONLY when the seeker explicitly asked, in this chat, to submit / send it. The extension presses the button in the tab and confirms from the page.",
      parameters: z.object({ jobId: id }),
      execute: async ({ jobId }) => {
        if (!known(jobId)) return 'unknown job';
        events.push({ type: 'submit', jobId });
        return 'the extension is pressing Submit and will confirm from the page (do not say it is submitted yet)';
      },
    }),
    tool({
      name: 'retry_job',
      description: 'Run the worker on this job again from where it stopped: it reads the form again, fills what is empty, and continues.',
      parameters: z.object({ jobId: id }),
      execute: async ({ jobId }) => {
        if (!known(jobId)) return 'unknown job';
        events.push({ type: 'retry', jobId });
        return 'the extension is running the job again';
      },
    }),
    tool({
      name: 'resume_jobs',
      description:
        'Pick up the jobs that are open in the browser but stopped running (after the panel or extension was reloaded) and keep going with the queue. Call it when the seeker says continue / resume / go on / start.',
      parameters: z.object({}),
      execute: async () => {
        events.push({ type: 'resume' });
        return 'resuming: the extension reattaches to the open tabs and restarts the queue';
      },
    }),
    tool({
      name: 'narrow_queue',
      description:
        'Remove WAITING jobs from the queue: under a match percentage ("only 90%+"), and/or from given companies ("skip Google"). Jobs already open are never touched. Returns how many were removed.',
      parameters: z.object({ min_match: z.number().int().min(1).max(100).nullable(), skip_companies: z.array(z.string().min(1).max(80)).max(20) }),
      execute: async ({ min_match, skip_companies }) => {
        if (!act) return 'not available';
        if (!min_match && !skip_companies.length) return 'say what to remove';
        const r = await act.narrowQueue({ ...(min_match && { minMatch: min_match }), ...(skip_companies.length && { companies: skip_companies }) });
        events.push({ type: 'refresh' });
        return JSON.stringify(r);
      },
    }),
    tool({
      name: 'update_settings',
      description:
        'Change how the extension applies: cover_letter (answer cover-letter questions), speed ("careful" 2 tabs, "smart" 4, "fast" 8), custom_message (the seeker\'s own note to work into cover letters and messages; empty string clears it). Pass null for anything not changing.',
      parameters: z.object({
        cover_letter: z.boolean().nullable(),
        speed: z.enum(['careful', 'smart', 'fast']).nullable(),
        custom_message: z.string().max(600).nullable(),
      }),
      execute: async (d) => {
        if (!act) return 'not available';
        const patch = {
          ...(d.cover_letter !== null && { coverLetter: d.cover_letter }),
          ...(d.speed !== null && { speed: d.speed }),
          ...(d.custom_message !== null && { customMessage: d.custom_message }),
        };
        const r = await act.updateSettings(patch);
        events.push({ type: 'refresh' });
        return JSON.stringify(r);
      },
    }),
    tool({
      name: 'pause_all',
      description: 'Stop starting new tabs. Use if something looks unsafe.',
      parameters: z.object({ reason: z.string().min(1).max(200) }),
      execute: async ({ reason }) => {
        events.push({ type: 'pause', reason });
        return 'paused';
      },
    }),
  ];
}

export async function runApplyOrchestrator(
  model: string,
  state: ApplyRunState & { blockedIds: string[]; blockedFields: Map<string, string[]>; jobIds?: string[] },
  turn: OrchestratorTurn,
  act?: QueueActions,
): Promise<{ reply: string; events: OrchestratorEvent[] }> {
  const events: OrchestratorEvent[] = [];
  const agent = new Agent({
    name: 'Plato apply orchestrator',
    instructions: buildApplyOrchestratorInstructions(state),
    model,
    tools: tools(events, new Set([...state.blockedIds, ...(state.jobIds ?? [])]), state.blockedFields, act),
  });
  const input: AgentInputItem[] = turn.history.map((m) =>
    m.role === 'user'
      ? { role: 'user' as const, content: m.content }
      : {
          role: 'assistant' as const,
          status: 'completed' as const,
          content: [{ type: 'output_text' as const, text: m.content }],
        },
  );
  input.push({
    role: 'user',
    content: turn.message ?? '(The run state changed. Check the blocked list and act.)',
  });
  const result = metered('extension.orchestrator', model, await run(agent, input));
  return {
    reply: typeof result.finalOutput === 'string' ? result.finalOutput : '',
    events,
  };
}
