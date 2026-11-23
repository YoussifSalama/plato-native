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

describe('pageState.kind: what the page is, from its structure (engine v3 stops on some before the brain acts)', () => {
  const at = (path: string, html: string) => {
    history.replaceState(null, '', path);
    return page(html);
  };
  it('an account to make: two password boxes, or one on a sign-up URL / under "create account"', () => {
    expect(at('/apply', '<form><input type="email"><input type="password"><input type="password"></form>').kind).toBe('ACCOUNT_SIGNUP');
    expect(at('/register', '<form><input type="email"><input type="password"></form>').kind).toBe('ACCOUNT_SIGNUP');
    expect(at('/apply', '<h1>Create an account</h1><form><input type="email"><input type="password"></form>').kind).toBe('ACCOUNT_SIGNUP');
  });
  it('a sign-in: one password box, even beside a "Sign up" link', () => {
    expect(at('/careers/login', '<h1>Sign in</h1><form><input type="email"><input type="password"></form><a>Forgot password?</a><a>Don’t have an account? Sign up</a>').kind).toBe('LOGIN');
  });
  it('an email code: a one-time-code box, a row of single-character boxes, or "check your inbox" with nothing to fill', () => {
    expect(at('/verify', '<form><input autocomplete="one-time-code"></form>').kind).toBe('EMAIL_VERIFICATION');
    expect(at('/x', `<form>${'<input maxlength="1">'.repeat(6)}</form>`).kind).toBe('EMAIL_VERIFICATION');
    expect(at('/x', '<h1>Check your inbox</h1><p>We’ve sent you a link to confirm your email.</p>').kind).toBe('EMAIL_VERIFICATION');
  });
  it('the email-only "enter your email to apply" step is NOT an account or a sign-in: Plato keeps going there', () => {
    const k = at('/apply', '<h1>Enter your email to apply</h1><form><input type="email"><button>Continue</button></form>').kind;
    expect(['ACCOUNT_SIGNUP', 'LOGIN', 'EMAIL_VERIFICATION']).not.toContain(k);
  });
  it('the application form, the job page with its Apply button, a human check, a confirmation, and nothing matched', () => {
    expect(at('/apply', '<form><label>Name<input></label><label>Email<input type="email"></label><input type="file"></form>').kind).toBe('APPLICATION_FORM');
    expect(at('/jobs/1', '<h1>Backend Engineer</h1><p>About the role</p><a href="#">Apply now</a>').kind).toBe('JOB_DESCRIPTION');
    expect(at('/x', '<p>Verify you are human</p>').kind).toBe('CAPTCHA');
    expect(at('/x', '<h2>Thank you for applying!</h2>').kind).toBe('SUBMITTED');
    expect(at('/x', '<p>Loading…</p>').kind).toBe('UNKNOWN');
  });
  it('the signature changes with a field value, never carries a password, and stays put when nothing changed', () => {
    history.replaceState(null, '', '/apply');
    document.body.innerHTML = '<form><input name="name"><input name="pw" type="password"></form>';
    const a = pageState(document).sig;
    expect(pageState(document).sig).toBe(a);
    (document.querySelector('[name=pw]') as HTMLInputElement).value = 'S3cret!';
    expect(pageState(document).sig).not.toContain('S3cret');
    (document.querySelector('[name=name]') as HTMLInputElement).value = 'Mona';
    expect(pageState(document).sig).not.toBe(a);
  });
});
