import { describe, expect, it } from 'vitest';
import { createBatchRunner } from '../src/core/batch-runner';
import { noticeText, type Notice } from '../src/core/notice';

const meta = { jobId: 'j1', title: 'Backend Engineer', company: 'Acme', provider: null };

describe('browser notifications: what the seeker hears outside the panel', () => {
  it('each outcome the batch record shows, once; a needs-you stop is urgent; cancelled and gone say nothing', () => {
    expect(noticeText({ kind: 'submitted', itemId: 'a', meta, note: 'The page confirmed it.' })).toEqual({ title: 'Applied: Backend Engineer at Acme', message: 'The page confirmed it.', urgent: false });
    expect(noticeText({ kind: 'needs-user', itemId: 'a', meta, note: 'This site asks you to sign in.' })).toMatchObject({ title: 'Plato needs you: Backend Engineer at Acme', urgent: true });
    expect(noticeText({ kind: 'skipped', itemId: 'a', meta, note: 'Closed.' })?.title).toBe('Skipped: Backend Engineer at Acme');
    expect(noticeText({ kind: 'failed', itemId: 'a', meta, note: 'x' })?.title).toBe('Not sent: Backend Engineer at Acme');
    expect(noticeText({ kind: 'cancelled', itemId: 'a', meta, note: 'x' })).toBeNull();
    expect(noticeText({ kind: 'gone', itemId: 'a', meta, note: 'x' })).toBeNull();
  });
  it('a job held before Submit: "Check the answers before Plato submits"; urgent only when the seeker chose Apply for me', () => {
    expect(noticeText({ kind: 'review', itemId: 'a', meta, reason: 'review_mode' })).toEqual({ title: 'Check the answers before Plato submits', message: 'Backend Engineer at Acme: The form is filled. Look over what Plato entered, then submit.', urgent: false });
    expect(noticeText({ kind: 'review', itemId: 'a', meta, reason: 'sensitive' })).toMatchObject({ title: 'Check the answers before Plato submits', urgent: true });
    expect(noticeText({ kind: 'review', itemId: 'a', meta, reason: 'no_list' })?.message).toContain('could not list');
  });
  it('the batch record calls it for every first outcome and when the batch finishes', () => {
    const heard: Notice[] = [];
    const r = createBatchRunner({ get: async () => null, set: async () => undefined, notify: (n) => heard.push(n) });
    r.start([{ itemId: 'a', meta }, { itemId: 'b', meta: { ...meta, jobId: 'j2' } }], 'test', true);
    r.record('a', 'submitted', 'ok');
    r.record('a', 'failed', 'late'); // the first outcome wins: no second notification
    r.record('b', 'skipped', 'closed');
    r.settle([], { sessions: {} } as never);
    expect(heard.map((n) => n.kind)).toEqual(['submitted', 'skipped', 'finished']);
    expect(noticeText(heard[2]!)?.title).toBe('Batch finished: 1 of 2 applied');
  });
});
