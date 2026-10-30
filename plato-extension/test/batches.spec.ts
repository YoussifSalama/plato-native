import { describe, expect, it } from 'vitest';
import type { ApiItem } from '../src/core/types';
import { latestBatch } from '../src/panel/jobs-view';

const it_ = (id: string, batch: string, at: string, state: ApiItem['state'] = 'PENDING') => ({ id, batch_id: batch, job_id: 'j' + id, provider: 'fx', state, attempt_id: null, seq: 0, lease_expires_at: null, detail: null, verify_reason: null, batch: { label: batch, created_at: at } }) as ApiItem;

describe('latestBatch', () => {
  it('only the newest pick is pre-ticked, older waiting jobs are never mixed in', () => {
    const items = [it_('1', 'old', '2026-10-17T10:00:00Z'), it_('2', 'old', '2026-10-17T10:00:00Z'), it_('3', 'new', '2026-10-18T10:00:00Z'), it_('4', 'new', '2026-10-18T10:00:00Z', 'REVIEW')];
    expect(latestBatch(items).map((i: ApiItem) => i.id)).toEqual(['3']);
    expect(latestBatch([])).toEqual([]);
  });
});
