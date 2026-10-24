import { ApiError, type Api } from './api';
import type { TransitionBody } from './types';

// Transitions the backend hasn't acknowledged yet (network down, panel
// closed). Same (attempt_id, seq) is replayed, so the backend applies each at
// most once. Holds no token: it is as private as the rest of local storage
// (TRUSTED_CONTEXTS), and contains only attempt ids and evidence markers.
const KEY = 'plato.outbox';

export interface OutboxEntry {
  itemId: string;
  body: TransitionBody;
}
export interface OutboxArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export type FlushResult = { sent: number; conflicts: OutboxEntry[]; stopped: 'offline' | 'unauthorized' | null };

export function createOutbox(area: OutboxArea) {
  const read = async () => ((await area.get(KEY))[KEY] as OutboxEntry[] | undefined) ?? [];
  const write = (v: OutboxEntry[]) => area.set({ [KEY]: v });
  return {
    list: read,
    async enqueue(e: OutboxEntry) {
      const all = await read();
      if (!all.some((x) => x.itemId === e.itemId && x.body.attempt_id === e.body.attempt_id && x.body.seq === e.body.seq))
        await write([...all, e]);
    },
    /** In order; stops at the first transient failure so order is kept. */
    async flush(api: Api): Promise<FlushResult> {
      const result: FlushResult = { sent: 0, conflicts: [], stopped: null };
      const queue = await read();
      while (queue.length) {
        const e = queue[0]!;
        try {
          await api.transition(e.itemId, e.body);
          result.sent++;
        } catch (err) {
          const s = err instanceof ApiError ? err.status : 0;
          if (s === 401 || s === 403) {
            result.stopped = 'unauthorized';
            break;
          }
          if (s === 409) result.conflicts.push(e); // applied already, or the item moved on: reconcile
          else if (s === 0 || s >= 500 || s === 429) {
            result.stopped = 'offline';
            break;
          }
          // other 4xx (400): the entry can never succeed; drop it
        }
        queue.shift();
      }
      await write(queue);
      return result;
    },
  };
}
export type Outbox = ReturnType<typeof createOutbox>;
