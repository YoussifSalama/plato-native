import { describe, expect, it } from 'vitest';
import { createErrorReporter, pageOf, type ClientError } from '../src/core/error-report';

const setup = (send?: (b: ClientError) => Promise<unknown>) => {
  let t = 0;
  const sent: ClientError[] = [];
  const report = createErrorReporter({ send: send ?? (async (b) => void sent.push(b)), now: () => t });
  return { report, sent, tick: (ms: number) => (t += ms) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('client error reporter', () => {
  it('sends the same message at most once a minute', async () => {
    const { report, sent, tick } = setup();
    expect(report({ message: 'boom' })).toBe(true);
    expect(report({ message: 'boom' })).toBe(false);
    tick(59_000);
    expect(report({ message: 'boom' })).toBe(false);
    tick(1_000);
    expect(report({ message: 'boom' })).toBe(true);
    await flush();
    expect(sent).toHaveLength(2);
  });

  it('sends at most 20 a minute', async () => {
    const { report, sent, tick } = setup();
    for (let i = 0; i < 30; i++) report({ message: `e${i}` });
    await flush();
    expect(sent).toHaveLength(20);
    tick(60_000);
    expect(report({ message: 'later' })).toBe(true);
  });

  it('caps the sizes and keeps data to a few KB', async () => {
    const { report, sent } = setup();
    report({ message: 'x'.repeat(2000), stack: 's'.repeat(10_000), data: { big: 'd'.repeat(10_000) } });
    await flush();
    const b = sent[0]!;
    expect(b.message).toHaveLength(500);
    expect(b.stack).toHaveLength(4000);
    expect(JSON.stringify(b.data).length).toBeLessThan(4100);
  });

  it('never throws or rejects when sending fails', async () => {
    const { report } = setup(() => Promise.reject(new Error('offline')));
    const throwing = createErrorReporter({ send: () => { throw new Error('sync'); } });
    expect(report({ message: 'a' })).toBe(true);
    expect(throwing({ message: 'b' })).toBe(true);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => report({ message: 'c', data: circular })).not.toThrow();
    await flush();
  });

  it('keeps a page address without its query', () => {
    expect(pageOf('https://boards.greenhouse.io/acme/jobs/1?token=secret#x')).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(pageOf('not a url')).toBeUndefined();
  });
});
