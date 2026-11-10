import { ChatThreadController } from './chat-thread.controller';

// The guard and service pull in ESM-only dependencies; only the SSE shape is under test.
jest.mock('../auth/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));
jest.mock('./chat-thread.service', () => ({ ChatThreadService: class {} }));
jest.mock('../credits/tokens.guard', () => ({ TokensGuard: class {} }));

it('streams delta and status, then done with the message and page events', async () => {
  const chunks: string[] = [];
  const res = {
    setHeader() {
      return res;
    },
    flushHeaders() {},
    write: (s: string) => chunks.push(s),
    end: jest.fn(),
  };
  const send = jest.fn(
    (
      _u: string,
      _t: string,
      _c: string,
      _ui: unknown,
      o: { onDelta: (t: string) => void; onStatus: (t: string) => void },
    ) => {
      o.onStatus('Building your resume');
      o.onDelta('Done');
      return Promise.resolve({
        message: { id: 'm1' },
        events: [{ type: 'goto', path: '/applications' }],
      });
    },
  );
  await new ChatThreadController({ send } as never).stream(
    { userId: 'u' } as never,
    't',
    { content: 'hi', attachmentIds: ['d1'] },
    res as never,
  );
  expect(send.mock.calls[0][4]).toMatchObject({ attachmentIds: ['d1'] });
  expect(chunks.join('')).toBe(
    'event: status\ndata: {"text":"Building your resume"}\n\n' +
      'event: delta\ndata: {"text":"Done"}\n\n' +
      'event: done\ndata: {"message":{"id":"m1"},"events":[{"type":"goto","path":"/applications"}]}\n\n',
  );
  expect(res.end).toHaveBeenCalled();
});
