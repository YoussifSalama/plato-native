process.env.ANTHROPIC_API_KEY ??= 'test';
import { NEW_PASSWORD, SAVED_PASSWORD, V3SessionService } from './v3-session.service';

// The second lock on job-site accounts (the executor's vault dep is the first): with the seeker's setting off,
// a password placeholder never reaches the browser.
describe('v3: password placeholders follow the seeker setting', () => {
  const svc = new V3SessionService({} as never, {} as never, {} as never) as unknown as { refuse(s: object, name: string, input: object): string };
  const s = (createAccounts: boolean) => ({ hosts: ['jobs.example'], createAccounts });
  it('refused while off, allowed while on; ordinary typing is unaffected', () => {
    expect(svc.refuse(s(false), 'type', { text: NEW_PASSWORD })).toMatch(/off in the seeker's settings/);
    expect(svc.refuse(s(false), 'type', { text: SAVED_PASSWORD })).toMatch(/off/);
    expect(svc.refuse(s(true), 'type', { text: NEW_PASSWORD })).toBe('');
    expect(svc.refuse(s(false), 'type', { text: 'Cairo' })).toBe('');
  });
});
