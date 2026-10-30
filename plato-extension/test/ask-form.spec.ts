// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskQuestion } from '../src/v3/contract';
import { clearAskDraft, OTHER, renderAskForm } from '../src/panel/ask-form';

const q = (over: Partial<AskQuestion> & { id: string }): AskQuestion => ({ label: `Question ${over.id}?`, type: 'text', ...over });
const pills = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('button.opt')];
const pill = (root: HTMLElement, text: string) => pills(root).find((b) => b.textContent === text)!;
const send = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[id^="ask-send-"]');
const next = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[id^="ask-next-"]');
const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
beforeEach(() => clearAskDraft('k'));

describe('the question form: the control the answer needs, not a text box', () => {
  it('a yes/no question is two pills; the send button waits for a pick; the answer goes out as "label → value"', () => {
    const onSubmit = vi.fn();
    const root = renderAskForm(document, 'k', [q({ id: 'relocate', label: 'Are you willing to relocate to Munich?', type: 'boolean', options: ['Yes', 'No'], why: 'Required field.' })], { onSubmit });
    expect(pills(root).map((b) => b.textContent)).toEqual(['Yes', 'No']);
    expect(root.querySelector('input, textarea')).toBeNull();
    expect(root.textContent).toContain('Required field.');
    expect(send(root)!.disabled).toBe(true);
    pill(root, 'No').click();
    expect(pill(root, 'No').getAttribute('aria-pressed')).toBe('true');
    expect(send(root)!.disabled).toBe(false);
    send(root)!.click();
    expect(onSubmit).toHaveBeenCalledWith('Are you willing to relocate to Munich? → No', [{ id: 'relocate', label: 'Are you willing to relocate to Munich?', value: 'No' }]);
  });
  it('several questions are a stepper: one at a time, Next waits for an answer, Back returns, the last step sends them all', () => {
    const onSubmit = vi.fn();
    const root = renderAskForm(document, 'k', [q({ id: 'a', type: 'boolean', options: ['Yes', 'No'] }), q({ id: 'b', label: 'Notice period?', type: 'choice', options: ['Now', '1 month'] }), q({ id: 'c', label: 'Anything else?', type: 'textarea', required: false })], { onSubmit });
    expect(root.textContent).toContain('Question 1 of 3');
    expect(root.querySelectorAll('.dots i').length).toBe(3);
    expect(next(root)!.disabled).toBe(true);
    pill(root, 'Yes').click();
    next(root)!.click();
    expect(root.textContent).toContain('Question 2 of 3');
    expect(root.textContent).toContain('Notice period?');
    root.querySelector<HTMLButtonElement>('button.btn.ghost')!.click(); // Back
    expect(root.textContent).toContain('Question 1 of 3');
    expect(pill(root, 'Yes').getAttribute('aria-pressed')).toBe('true'); // the pick survived
    next(root)!.click();
    pill(root, '1 month').click();
    next(root)!.click();
    expect(root.textContent).toContain('Question 3 of 3');
    expect(send(root)!.disabled).toBe(false); // optional: may be skipped
    expect(send(root)!.textContent).toBe('Answer all');
    send(root)!.click();
    expect(onSubmit).toHaveBeenCalledWith('Question a? → Yes\nNotice period? → 1 month', [
      { id: 'a', label: 'Question a?', value: 'Yes' },
      { id: 'b', label: 'Notice period?', value: '1 month' },
    ]);
  });
  it('"Something else" opens a free box; its text is the answer; a multi question collects several picks', () => {
    const onSubmit = vi.fn();
    const root = renderAskForm(document, 'k', [q({ id: 'n', label: 'Notice?', type: 'choice', options: ['Now', '1 month'], other: true }), q({ id: 's', label: 'Which stacks?', type: 'multi', options: ['React', 'Vue', 'Angular'] })], { onSubmit });
    expect(root.querySelector('textarea')).toBeNull();
    pill(root, OTHER).click();
    const box = root.querySelector('textarea')!;
    expect(next(root)!.disabled).toBe(true); // "something else" needs words
    type(box, 'Six weeks');
    expect(next(root)!.disabled).toBe(false);
    next(root)!.click();
    pill(root, 'React').click();
    pill(root, 'Angular').click();
    pill(root, 'Vue').click();
    pill(root, 'Vue').click(); // toggled off again
    send(root)!.click();
    expect(onSubmit.mock.calls[0]![0]).toBe('Notice? → Six weeks\nWhich stacks? → React, Angular');
  });
  it('more than six options is a select; a typed answer submits on Enter', () => {
    const onSubmit = vi.fn();
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const root = renderAskForm(document, 'k', [q({ id: 'c', type: 'choice', options: many })], { onSubmit });
    const sel = root.querySelector('select')!;
    expect([...sel.options].map((o) => o.value)).toEqual(['', ...many]);
    sel.value = 'E';
    sel.dispatchEvent(new Event('change'));
    send(root)!.click();
    expect(onSubmit.mock.calls[0]![1]).toEqual([{ id: 'c', label: 'Question c?', value: 'E' }]);
    clearAskDraft('k');
    const typed = renderAskForm(document, 'k', [q({ id: 't', type: 'text' })], { onSubmit });
    const input = typed.querySelector('input')!;
    type(input, 'Cairo');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSubmit.mock.calls[1]![0]).toBe('Question t? → Cairo');
  });
  it('a draft survives a panel redraw (same key) and is cleared once sent', () => {
    const onSubmit = vi.fn();
    const qs = [q({ id: 'a', type: 'boolean', options: ['Yes', 'No'] }), q({ id: 'b', type: 'text' })];
    const first = renderAskForm(document, 'k', qs, { onSubmit });
    pill(first, 'Yes').click();
    next(first)!.click();
    type(first.querySelector('input')!, 'half typed');
    const again = renderAskForm(document, 'k', qs, { onSubmit }); // the panel redrew the row
    expect(again.textContent).toContain('Question 2 of 2');
    expect(again.querySelector('input')!.value).toBe('half typed');
    send(again)!.click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const fresh = renderAskForm(document, 'k', qs, { onSubmit });
    expect(fresh.textContent).toContain('Question 1 of 2'); // the draft is gone
  });
  it('busy: the send button is held', () => {
    const root = renderAskForm(document, 'k', [q({ id: 'a', type: 'boolean', options: ['Yes', 'No'] })], { busy: true, onSubmit: vi.fn() });
    pill(root, 'Yes').click();
    expect(send(root)!.disabled).toBe(true);
  });
});
