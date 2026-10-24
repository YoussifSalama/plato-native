// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listForms } from '../src/dom/inspect';
import { submitForm } from '../src/dom/submit';

const page = (html: string) => {
  document.body.innerHTML = html;
  const f = listForms(document).forms[0]!;
  const onSubmit = vi.fn((e: Event) => e.preventDefault());
  document.querySelector('form')!.addEventListener('submit', onSubmit);
  return { id: f.id, onSubmit };
};

describe('submitForm (the only submit in the extension)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('clicks the one visible submit control, once', () => {
    const { id, onSubmit } = page('<form><input name="a" type="text"><button type="submit">Apply</button></form>');
    expect(submitForm(document, id)).toEqual({ clicked: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('refuses to guess: two submit buttons, none, or disabled', () => {
    const two = page('<form><input name="a"><button>Save draft</button><button>Apply</button></form>');
    expect(submitForm(document, two.id)).toEqual({ clicked: false, reason: 'ambiguous-submit' });
    expect(two.onSubmit).not.toHaveBeenCalled();
    const none = page('<form><input name="a"><button type="button">Next</button></form>');
    expect(submitForm(document, none.id)).toEqual({ clicked: false, reason: 'no-submit-control' });
    const off = page('<form><input name="a"><button disabled>Apply</button></form>');
    expect(submitForm(document, off.id)).toEqual({ clicked: false, reason: 'disabled' });
  });

  it('never acts on a form it did not register', () => {
    page('<form><button>Apply</button></form>');
    expect(submitForm(document, 'form999')).toEqual({ clicked: false, reason: 'unknown-form' });
  });
});
