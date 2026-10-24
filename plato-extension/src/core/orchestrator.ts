import { ApiError, type Api } from './api';
import type { Outbox } from './outbox';
import { planReconcile, type ReconcileAction } from './reconcile';
import type { ApiItem, Evidence, ItemState, PolicyMap, TransitionBody } from './types';
import type { Registry } from '../providers/registry';
import type { ProviderAdapter } from '../providers/types';

// Provider-agnostic: no selectors, no site assumptions. All page knowledge is
// behind ProviderAdapter, and an adapter cannot submit (see providers/types.ts).
import { HEARTBEAT_MS_CONTRACT } from './contract';
export const HEARTBEAT_MS = HEARTBEAT_MS_CONTRACT;

export interface Session {
  item: ApiItem;
  attemptId: string;
  seq: number; // last seq the backend acknowledged (or we queued)
  tabId?: number;
  adapter: ProviderAdapter;
}

export class OrchestratorError extends Error {
  constructor(
    public code: 'blocked' | 'no_adapter' | 'arm_failed' | 'lost' | 'unauthorized' | 'bad_state',
    message: string,
  ) {
    super(message);
  }
}

export interface OrchestratorDeps {
  api: Api;
  outbox: Outbox;
  registry: Registry;
  policy: () => PolicyMap | undefined; // server policy; undefined = unknown = blocked
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  onLost?: (itemId: string) => void;
}

export function createOrchestrator(d: OrchestratorDeps) {
  const sessions = new Map<string, Session>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const every = d.setInterval ?? setInterval;
  const stop = d.clearInterval ?? clearInterval;

  const forget = (id: string) => {
    const t = timers.get(id);
    if (t !== undefined) stop(t);
    timers.delete(id);
    sessions.delete(id);
  };

  function startHeartbeat(s: Session) {
    const id = s.item.id;
    timers.set(
      id,
      every(() => {
        d.api.heartbeat(id, s.attemptId).catch((e) => {
          // 409: the lease or attempt is gone. Anything else is transient.
          if (e instanceof ApiError && e.status === 409) {
            forget(id);
            d.onLost?.(id);
          }
        });
      }, HEARTBEAT_MS),
    );
  }

  /** Send one transition. Un-acked terminal moves go to the outbox. */
  async function send(s: Session, to: TransitionBody['to'], detail?: TransitionBody['detail'], mustAck = false) {
    const body: TransitionBody = { attempt_id: s.attemptId, seq: s.seq + 1, to, ...(detail && { detail }) };
    try {
      const updated = await d.api.transition(s.item.id, body);
      s.seq = body.seq;
      s.item = { ...s.item, ...updated };
      return updated;
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401) throw new OrchestratorError('unauthorized', 'Pairing expired or revoked');
      if (status === 409) {
        forget(s.item.id);
        throw new OrchestratorError('lost', 'This item changed elsewhere; reload it');
      }
      // Arming must be acknowledged BEFORE the person is told to submit.
      if (mustAck) throw new OrchestratorError('arm_failed', 'Could not record that you are about to submit. Nothing was sent. Try again.');
      if (status === 0 || status >= 500 || status === 429) {
        await d.outbox.enqueue({ itemId: s.item.id, body });
        s.seq = body.seq; // queued: keep the order
        return null;
      }
      throw e;
    }
  }

  const adapterFor = async (provider: string | null) => {
    const def = provider ? d.registry.get(provider) : undefined;
    if (!def || d.registry.policyOf(def.id, d.policy()) !== 'FILL_ONLY')
      throw new OrchestratorError('blocked', 'This provider is not enabled');
    if (!def.adapter) throw new OrchestratorError('no_adapter', 'No adapter for this provider yet');
    return def.adapter();
  };

  return {
    sessions,
    session: (id: string) => sessions.get(id),

    /**
     * Take over a job THIS device already holds (the panel was reloaded: the in-memory session is gone but
     * the server still has the attempt). No new claim: the same attempt id and seq continue, and the
     * heartbeat starts again. If the lease was lost meanwhile the heartbeat's 409 hands the job back.
     */
    async adopt(item: ApiItem, tabId?: number): Promise<Session> {
      if (!item.attempt_id) throw new OrchestratorError('bad_state', 'Nothing to resume');
      const adapter = await adapterFor(item.provider);
      const s: Session = { item, attemptId: item.attempt_id, seq: item.seq, tabId, adapter };
      sessions.set(item.id, s);
      startHeartbeat(s);
      return s;
    },

    /** Policy and adapter are checked BEFORE anything is claimed on the server. */
    async claim(item: ApiItem, tabId?: number): Promise<Session> {
      const adapter = await adapterFor(item.provider);
      const claimed = await d.api.claim(item.id);
      const s: Session = { item: claimed, attemptId: claimed.attempt_id!, seq: claimed.seq, tabId, adapter };
      sessions.set(item.id, s);
      startHeartbeat(s);
      return s;
    },

    /** CLAIMED -> PREPARING -> (NEEDS_USER | REVIEW | FAILED). Never submits. */
    async prepare(s: Session, jobUrl: string): Promise<'review' | 'needs-user' | 'failed' | 'skipped'> {
      await send(s, 'PREPARING');
      const r = await s.adapter.prepare({ tabId: s.tabId ?? -1, jobUrl });
      if (r.kind === 'ready') {
        await send(s, 'FILLING');
        await send(s, 'REVIEW');
        return 'review';
      }
      if (r.kind === 'needs-user') {
        await send(s, 'NEEDS_USER', { reason: r.reason, ...(r.detail && { message: r.detail.slice(0, 300) }) });
        return 'needs-user';
      }
      if (r.kind === 'skip') {
        // closed posting / already applied: nothing to do, so SKIPPED with the true reason (not a failure, not "needs you")
        await send(s, 'SKIPPED', { reason: r.reason, message: r.message.slice(0, 300) });
        forget(s.item.id);
        return 'skipped';
      }
      await send(s, 'FAILED', { failure_kind: 'blocked_by_site', message: r.message.slice(0, 300) });
      forget(s.item.id);
      return 'failed';
    },

    /**
     * The person says the form is ready and they will press Submit themselves.
     * Recorded on the server FIRST; only then does the UI tell them to submit.
     */
    async armForSubmit(s: Session) {
      await send(s, 'AWAITING_SUBMIT', undefined, true);
    },

    /** Read-only look at the live page. Only a clear marker becomes "confirmed". */
    async observe(s: Session): Promise<Evidence> {
      const ev = s.tabId === undefined ? ({ kind: 'unknown' } as Evidence) : await s.adapter.inspectOutcome(s.tabId);
      if (ev.kind === 'confirmed') {
        await send(s, 'SUBMITTED_CONFIRMED', { marker: ev.marker });
        forget(s.item.id);
      }
      return ev;
    },

    /** The engine proved the submission from the page's words (a quote found on the page): recorded with that marker. */
    async confirm(s: Session, marker: string) {
      await send(s, 'SUBMITTED_CONFIRMED', { marker: marker.slice(0, 200) });
      forget(s.item.id);
    },
    async attest(s: Session) {
      await send(s, 'SUBMITTED_ATTESTED');
      forget(s.item.id);
    },
    /** Nothing to do on this job (closed, already applied): SKIPPED with the true reason. */
    async skip(s: Session, reason: string, message: string) {
      await send(s, 'SKIPPED', { reason: reason.slice(0, 100), message: message.slice(0, 300) });
      forget(s.item.id);
    },
    async notSure(s: Session, reason = 'user_unsure') {
      await send(s, 'VERIFY', { reason });
    },
    async notSubmitted(s: Session) {
      await send(s, 'FAILED', { failure_kind: 'not_submitted' });
      forget(s.item.id);
    },
    async cancel(s: Session) {
      await send(s, 'CANCELLED');
      forget(s.item.id);
    },

    /**
     * After a restart: compare each server item with what the live page shows
     * and recommend (or, for evidence-backed ones, record) the safe next step.
     * Ambiguity goes to VERIFY; nothing is ever re-sent.
     */
    async reconcile(
      items: ApiItem[],
      probe: (item: ApiItem) => Promise<Evidence>,
    ): Promise<{ item: ApiItem; plan: ReconcileAction }[]> {
      const out: { item: ApiItem; plan: ReconcileAction }[] = [];
      for (const item of items) {
        const held = sessions.get(item.id);
        const armedish = item.state === 'AWAITING_SUBMIT' || item.state === 'VERIFY';
        // A live session in this panel is the source of truth: the person is
        // working right now. Never second-guess it from a page probe.
        if (held && held.attemptId === item.attempt_id) {
          out.push({ item, plan: { action: armedish ? 'none' : 'continue' } });
          continue;
        }
        const evidence = armedish ? await probe(item).catch((): Evidence => ({ kind: 'unknown' })) : ({ kind: 'unknown' } as Evidence);
        const plan = planReconcile(item, evidence, false);
        // Recording what we can PROVE (or the safe VERIFY) needs the attempt id.
        if (item.attempt_id && (plan.action === 'confirm' || plan.action === 'to-verify')) {
          const s: Session = {
            item,
            attemptId: item.attempt_id,
            seq: item.seq,
            adapter: undefined as unknown as ProviderAdapter, // not needed to record
          };
          if (plan.action === 'confirm') await send(s, 'SUBMITTED_CONFIRMED', { marker: plan.marker });
          else await send(s, 'VERIFY', { reason: plan.reason });
          forget(item.id);
        }
        out.push({ item, plan });
      }
      return out;
    },

    /** Settle a VERIFY item (any panel): the person's word, recorded as such. */
    async settle(item: ApiItem, answer: 'submitted' | 'not-submitted') {
      if (!item.attempt_id || item.state !== 'VERIFY') throw new OrchestratorError('bad_state', 'Not waiting for you');
      const s: Session = { item, attemptId: item.attempt_id, seq: item.seq, adapter: undefined as unknown as ProviderAdapter };
      await send(s, answer === 'submitted' ? 'SUBMITTED_ATTESTED' : 'FAILED', answer === 'submitted' ? undefined : { failure_kind: 'not_submitted' });
    },

    /** Pre-armed items we don't hold anymore: give the job back. */
    async release(item: ApiItem) {
      if (!item.attempt_id) throw new OrchestratorError('bad_state', 'Nothing to release');
      const s: Session = { item, attemptId: item.attempt_id, seq: item.seq, adapter: undefined as unknown as ProviderAdapter };
      await send(s, 'CANCELLED');
      forget(item.id);
    },

    flushOutbox: () => d.outbox.flush(d.api),
    stopAll: () => [...sessions.keys()].forEach(forget),
  };
}
export type Orchestrator = ReturnType<typeof createOrchestrator>;
export type { ItemState };
