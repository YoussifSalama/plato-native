import { CareerController } from './career.controller';

// The guard and service pull in ESM-only dependencies; only the SSE shape is under test.
jest.mock('../auth/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));
jest.mock('./career.service', () => ({ CareerService: class {} }));
jest.mock('./career-voice.service', () => ({
  CareerVoiceService: class {},
  voiceStartSchema: {},
  voiceTranscriptSchema: {},
}));
jest.mock('./career-resumes.service', () => ({
  CareerResumesService: class {},
}));

it('streams delta events then done, and an error event on failure', async () => {
  const chunks: string[] = [];
  const res = {
    setHeader() {
      return res;
    },
    flushHeaders() {},
    write: (s: string) => chunks.push(s),
    end: jest.fn(),
  };
  const ok = {
    send: (_u: string, _t: string, _c: string, on: (t: string) => void) => {
      on('Hel');
      on('lo');
      return Promise.resolve({ message: { id: 'm1', content: 'Hello' } });
    },
  };
  await new CareerController(ok as never, {} as never, {} as never).stream(
    { userId: 'u' } as never,
    't',
    { content: 'hi' },
    res as never,
  );
  expect(chunks.join('')).toBe(
    'event: delta\ndata: {"text":"Hel"}\n\n' +
      'event: delta\ndata: {"text":"lo"}\n\n' +
      'event: done\ndata: {"message":{"id":"m1","content":"Hello"}}\n\n',
  );

  chunks.length = 0;
  const bad = { send: () => Promise.reject(new Error('boom')) };
  await new CareerController(bad as never, {} as never, {} as never).stream(
    { userId: 'u' } as never,
    't',
    { content: 'hi' },
    res as never,
  );
  expect(chunks.join('')).toBe('event: error\ndata: {"message":"boom"}\n\n');
  expect(res.end).toHaveBeenCalledTimes(2);
});
