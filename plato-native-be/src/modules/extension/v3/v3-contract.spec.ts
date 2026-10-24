import { parseOutcome } from './v3-contract';
import { registrable, V3SessionService } from './v3-session.service';

describe('parseOutcome', () => {
  it('reads the keyword at the start of the answer', () => {
    expect(parseOutcome('SUBMIT_READY every field holds a value')).toEqual({
      kind: 'submit_ready',
      summary: 'every field holds a value',
    });
    expect(parseOutcome('ASK: Are you authorised to work in Germany?')).toEqual(
      { kind: 'ask', question: 'Are you authorised to work in Germany?' },
    );
    expect(parseOutcome('CONFIRMED Thank you for applying')).toEqual({
      kind: 'confirmed',
      quote: 'Thank you for applying',
    });
    expect(parseOutcome('UNCONFIRMED the page still shows the form').kind).toBe(
      'unconfirmed',
    );
  });

  it('reads the keyword after a sentence of the model’s own (the last keyword line wins)', () => {
    expect(
      parseOutcome(
        'All required fields hold a value and the resume is attached.\n\nSUBMIT_READY — Name, email, phone, resume.',
      ),
    ).toEqual({ kind: 'submit_ready', summary: 'Name, email, phone, resume.' });
    expect(
      parseOutcome(
        'I pressed Submit once.\nCONFIRMED Your application has been received',
      ),
    ).toEqual({
      kind: 'confirmed',
      quote: 'Your application has been received',
    });
    expect(
      parseOutcome(
        'There is one field I cannot answer.\nASK: What is your notice period?',
      ),
    ).toEqual({ kind: 'ask', question: 'What is your notice period?' });
  });

  it('never turns words without a keyword into success', () => {
    expect(parseOutcome('I think everything is done.')).toEqual({
      kind: 'blocked',
      reason: 'I think everything is done.',
    });
    expect(parseOutcome('')).toEqual({
      kind: 'blocked',
      reason: 'The model ended without a result.',
    });
    expect(parseOutcome('The form says submit_ready is not a thing').kind).toBe(
      'blocked',
    ); // mid-line, not a keyword line
  });
});

describe('registrable (URL policy)', () => {
  it('keeps the site of a host', () => {
    expect(registrable('jobs.lever.co')).toBe('lever.co');
    expect(registrable('job-boards.eu.greenhouse.io')).toBe('greenhouse.io');
    expect(registrable('jobs.ashbyhq.com')).toBe('ashbyhq.com');
  });
  it('never widens to a country second level', () => {
    expect(registrable('careers.acme.co.uk')).toBe('acme.co.uk');
    expect(registrable('jobs.acme.com.eg')).toBe('acme.com.eg');
    expect(registrable('apply.acme.co.jp')).toBe('acme.co.jp');
  });
});

describe('V3SessionService.status', () => {
  const svc = Object.create(V3SessionService.prototype) as V3SessionService;
  (svc as unknown as { sessions: Map<string, unknown> }).sessions = new Map([
    [
      'i1',
      {
        jobSeekerId: 'js1',
        turns: 3,
        model: 'm',
        startedAt: Date.now(),
        lastAt: Date.now(),
        submitAllowed: false,
        submitPressed: false,
      },
    ],
  ]);
  it('answers only the seeker who owns the item', () => {
    expect(svc.status({ jobSeekerId: 'js1' } as never, 'i1')).toMatchObject({
      turns: 3,
      model: 'm',
    });
    expect(svc.status({ jobSeekerId: 'other' } as never, 'i1')).toBeNull();
  });
});
