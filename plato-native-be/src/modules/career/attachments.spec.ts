import { withAttachments } from './attachments';

it('adds attached CV text to the model input only', () => {
  const docs = new Map([
    ['d1', { id: 'd1', name: 'cv.pdf', text: 'React developer at Acme' }],
  ]);
  const ui = { type: 'attachment', documents: [{ id: 'd1', name: 'cv.pdf' }] };
  const text = withAttachments('Improve this', ui, docs);
  expect(text).toContain('Improve this');
  expect(text).toContain('"cv.pdf"');
  expect(text).toContain('React developer at Acme');
  // no attachment, a deleted document, or another message kind: unchanged
  expect(withAttachments('Hi', null, docs)).toBe('Hi');
  expect(withAttachments('Hi', { type: 'resume' }, docs)).toBe('Hi');
  expect(
    withAttachments(
      'Hi',
      { type: 'attachment', documents: [{ id: 'x' }] },
      docs,
    ),
  ).toBe('Hi');
});
