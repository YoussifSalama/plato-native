// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pageState } from '../src/dom/page-state';

const page = (html: string) => {
  document.body.innerHTML = html;
  return pageState(document);
};

describe('pageState: a confirmation the page itself shows', () => {
  it('LinkedIn Easy Apply: "Application sent" / "Your application was sent to X!"', () => {
    expect(page('<h2>Application sent</h2><p>Your application was sent to Daam Outsourcing!</p>').confirmed).toMatch(/application (sent|was sent)/i);
    expect(page('<form><input><input></form><p>Application status: Application submitted</p>').confirmed).toMatch(/application submitted/i);
    expect(page('<span>Applied 3w ago</span>').confirmed).toMatch(/applied 3w ago/i);
    expect(page('<p>We applied 3 filters to this search</p>').confirmed).toBeNull();
  });
  it('a plain form proves nothing', () => {
    const s = page('<form><label>Name<input></label><label>Email<input></label></form>');
    expect(s.confirmed).toBeNull();
    expect(s.formPresent).toBe(true);
  });
});
