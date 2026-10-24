import { decideBodySchema } from './answers.service';

// A confirmation or listing page has no fields; the decision must still be accepted.
describe('decideBodySchema', () => {
  const snapshot = { url: 'https://x.test/', title: 't', dialogOpen: false, dialogTitle: '', elements: [], fields: { total: 0, empty: 0 }, alerts: [], text: '' };
  it('accepts zero fields', () => {
    expect(decideBodySchema.safeParse({ snapshot, history: [], autoSubmit: true, fields: [] }).success).toBe(true);
  });
});
