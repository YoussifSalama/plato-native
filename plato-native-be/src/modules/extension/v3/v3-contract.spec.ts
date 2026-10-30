import { applyPageOf, parseOutcome } from './v3-contract';
import { registrable, V3SessionService } from './v3-session.service';

describe('parseOutcome', () => {
  it('reads the keyword at the start of the answer', () => {
    expect(parseOutcome('SUBMIT_READY every field holds a value')).toEqual({
      kind: 'submit_ready',
      summary: 'every field holds a value',
    });
    expect(parseOutcome('ASK: Are you authorised to work in Germany?')).toMatchObject(
      { kind: 'ask', question: 'Are you authorised to work in Germany?', questions: [{ id: 'answer', type: 'textarea' }] },
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
    ).toMatchObject({ kind: 'ask', question: 'What is your notice period?' });
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

describe('applyPageOf', () => {
  it('uses apply_url when the job has one and the listing url otherwise, treating an empty apply_url as none (LinkedIn stores "")', () => {
    expect(applyPageOf({ apply_url: 'https://jobs.lever.co/x/apply', url: 'https://x.com/job' })).toBe('https://jobs.lever.co/x/apply');
    expect(applyPageOf({ apply_url: null, url: 'https://x.com/job' })).toBe('https://x.com/job');
    expect(applyPageOf({ apply_url: '', url: 'https://eg.linkedin.com/jobs/view/1' })).toBe('https://eg.linkedin.com/jobs/view/1');
    expect(() => new URL(applyPageOf({ apply_url: '', url: 'https://eg.linkedin.com/jobs/view/1' }))).not.toThrow();
  });
});

describe('parseOutcome: ASK with structured questions', () => {
  const fenced = `I filled everything else.
ASK: The form requires two facts your profile does not hold.
\`\`\`json
{"questions":[{"id":"relocate","label":"Are you willing to relocate to Munich?","type":"boolean","why":"Required field."},{"id":"notice","label":"What is your notice period?","type":"choice","options":["Immediately","1 month"],"other":true},{"id":"relocate","label":"duplicate id","type":"text"}]}
\`\`\``;
  it('reads the one-line summary and the JSON block; booleans get Yes/No; duplicate ids are dropped; required defaults to true', () => {
    const o = parseOutcome(fenced);
    expect(o.kind).toBe('ask');
    if (o.kind !== 'ask') return;
    expect(o.question).toBe('The form requires two facts your profile does not hold.');
    expect(o.questions.map((q) => q.id)).toEqual(['relocate', 'notice']);
    expect(o.questions[0]).toMatchObject({ type: 'boolean', options: ['Yes', 'No'], required: true, why: 'Required field.' });
    expect(o.questions[1]).toMatchObject({ type: 'choice', options: ['Immediately', '1 month'], other: true });
  });
  it('a bare object works too; a choice without options becomes a text question', () => {
    const o = parseOutcome('ASK: One thing. {"questions":[{"id":"salary","label":"Expected salary?","type":"choice"}]}');
    expect(o.kind === 'ask' && o.questions[0]).toMatchObject({ id: 'salary', type: 'text' });
    expect(o.kind === 'ask' && o.question).toBe('One thing.');
  });
  it('no block, malformed JSON, or too many questions: the line itself becomes one free-text question (never nothing)', () => {
    for (const text of ['ASK: Are you authorised to work in Peru?', 'ASK: Are you authorised to work in Peru? ```json {not json``` ', `ASK: Are you authorised to work in Peru? {"questions":${JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ id: 'q' + i, label: 'Q' + i, type: 'text' })))}}`]) {
      const o = parseOutcome(text);
      expect(o.kind === 'ask' && o.questions).toEqual([{ id: 'answer', label: 'Are you authorised to work in Peru?', type: 'textarea', required: true }]);
    }
  });
  it('the other stops keep the brain’s description', () => {
    expect(parseOutcome('CAPTCHA hCaptcha challenge appeared right after Submit on the Lever form')).toEqual({ kind: 'captcha', text: 'CAPTCHA hCaptcha challenge appeared right after Submit on the Lever form' });
    expect(parseOutcome('BLOCKED The Apply button opens a login page; the site needs an account first.')).toEqual({ kind: 'blocked', reason: 'The Apply button opens a login page; the site needs an account first.' });
  });
});
