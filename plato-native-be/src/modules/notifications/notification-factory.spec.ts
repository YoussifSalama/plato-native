import {
  applicationNotification,
  runNotification,
} from './notification-factory';

const at = new Date('2026-09-19T10:00:00Z');
const run = {
  id: 'r1',
  thread_id: 't1',
  query: { titles: ['Backend Developer'] },
  matched: 12,
  progress: { ranked: 9 },
  error: null,
  started_at: at,
  finished_at: at,
};
const app = {
  id: 'a1',
  error: null,
  updated_at: at,
  needs_input: null,
  job: { title: 'Engineer', company: 'Acme' },
};

describe('notification factory', () => {
  it('links a finished search to its thread and reports the ranked count', () => {
    const n = runNotification({ ...run, status: 'DONE' });
    expect(n).toMatchObject({
      id: 'run:r1:DONE',
      tone: 'success',
      title: '9 jobs ready',
      href: '/jobs/t1?run=r1',
    });
  });

  it('gives each status its own id so a change reads as unread again', () => {
    const ids = ['NEEDS_INPUT', 'SUBMITTED'].map(
      (status) => applicationNotification({ ...app, status }).id,
    );
    expect(new Set(ids).size).toBe(2);
  });

  it('tells questions apart from a human check, and deep-links to the row', () => {
    const questions = applicationNotification({
      ...app,
      status: 'NEEDS_INPUT',
      needs_input: { reason: 'questions', questions: [1, 2] },
    });
    const captcha = applicationNotification({
      ...app,
      status: 'NEEDS_INPUT',
      needs_input: { reason: 'captcha', questions: [] },
    });
    expect(questions.body).toContain('2 question(s)');
    expect(captcha.title).toBe('Finish this one yourself');
    expect(questions.href).toBe('/applications?focus=a1');
  });

  it('carries the failure reason', () => {
    expect(
      applicationNotification({
        ...app,
        status: 'FAILED',
        error: 'No processed CV on file',
      }).body,
    ).toContain('No processed CV on file');
  });
});
