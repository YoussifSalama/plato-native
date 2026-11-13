// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SAME_TAB_SOURCE, sameTab } from '../src/v3/same-tab';

// A window whose navigation we can watch (jsdom does not navigate).
const fakeWin = () => {
  const assign = vi.fn();
  const open = vi.fn(() => null);
  const w = { location: { href: 'https://www.linkedin.com/jobs/view/1', assign }, open, document } as unknown as Window & typeof globalThis;
  sameTab(w);
  return { w, assign, open };
};

describe('same tab: what the job page would open in a new tab opens in this one', () => {
  it('window.open(url) navigates this tab (LinkedIn Apply -> the company site)', () => {
    const { w, assign } = fakeWin();
    expect(w.open('https://talent.fullstack.com/jobs/1', '_blank')).toBe(w);
    expect(assign).toHaveBeenCalledWith('https://talent.fullstack.com/jobs/1');
  });
  it('a blank window whose location is set later lands here too', () => {
    const { w, assign } = fakeWin();
    const popup = w.open('', '_blank')!;
    (popup as unknown as { location: string }).location = '/apply/2';
    expect(assign).toHaveBeenCalledWith('https://www.linkedin.com/apply/2');
  });
  it('_self/_top keep the browser behaviour; javascript: URLs are never followed', () => {
    const { w, assign, open } = fakeWin();
    w.open('https://x.test/', '_self');
    expect(open).toHaveBeenCalled();
    w.open('javascript:alert(1)', '_blank');
    expect(assign).not.toHaveBeenCalled();
  });
  it('a target=_blank link and a form posting to a new window are retargeted to this tab', () => {
    fakeWin();
    document.body.innerHTML = '<a id="a" href="https://x.test/apply" target="_blank" rel="noopener">Apply now</a><form id="f" target="_blank"></form>';
    const a = document.getElementById('a') as HTMLAnchorElement;
    a.addEventListener('click', (e) => e.preventDefault()); // jsdom would try to navigate
    a.click();
    expect(a.target).toBe('_self');
    const f = document.getElementById('f') as HTMLFormElement;
    f.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(f.target).toBe('_self');
  });
  it('installs once, and its page source is self-contained (no bundler helpers)', () => {
    const { w } = fakeWin();
    const again = w.open;
    sameTab(w);
    expect(w.open).toBe(again);
    expect(SAME_TAB_SOURCE).toMatch(/^\(function sameTab\(win\)/);
    expect(SAME_TAB_SOURCE).not.toMatch(/__name|__require|import /);
  });
});
