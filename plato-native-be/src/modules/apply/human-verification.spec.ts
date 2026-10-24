import { classifyVerification, isInvisibleWidget } from './human-verification';

describe('human verification detection', () => {
  it('(A) normal form interaction: no widget, no wording, button usable', () => {
    expect(
      classifyVerification({ frames: [], pageText: [], submitDisabled: false }),
    ).toEqual({ blocked: false, indicators: [] });
    // A disabled button alone is ordinary validation / a spinner, not a CAPTCHA.
    expect(
      classifyVerification({ frames: [], pageText: [], submitDisabled: true })
        .blocked,
    ).toBe(false);
  });

  it('(B) Cloudflare "Verify you are human" with a disabled Submit (the audit case)', () => {
    const state = classifyVerification({
      frames: [
        {
          provider: 'Cloudflare Turnstile',
          text: 'Verify you are human CLOUDFLARE Privacy Help',
        },
      ],
      pageText: [],
      submitDisabled: true,
    });
    expect(state.blocked).toBe(true);
    expect(state.indicators[0]).toContain('Cloudflare Turnstile');
    expect(state.indicators).toContain('submit button is disabled');
  });

  it('(B) other providers and wording: hCaptcha, reCAPTCHA "I\'m not a robot"', () => {
    expect(
      classifyVerification({
        frames: [{ provider: 'hCaptcha', text: 'I am human' }],
        pageText: [],
        submitDisabled: null,
      }).blocked,
    ).toBe(true);
    expect(
      classifyVerification({
        frames: [{ provider: 'reCAPTCHA', text: "I'm not a robot" }],
        pageText: [],
        submitDisabled: false,
      }).blocked,
    ).toBe(true);
    // Wording in the page with a button that can't be used.
    expect(
      classifyVerification({
        frames: [],
        pageText: ['Verify you are human'],
        submitDisabled: true,
      }).blocked,
    ).toBe(true);
  });

  it('wording alone does not block a form whose Submit works (e.g. text in a job description)', () => {
    expect(
      classifyVerification({
        frames: [],
        pageText: ['human verification'],
        submitDisabled: false,
      }).blocked,
    ).toBe(false);
  });

  it('a completed check stops blocking even though the widget stays on the page', () => {
    const solved = classifyVerification({
      frames: [
        { provider: 'Cloudflare Turnstile', text: 'Success! CLOUDFLARE' },
      ],
      pageText: [],
      submitDisabled: false,
    });
    expect(solved).toEqual({ blocked: false, indicators: [] });
  });

  it('detection alone never means submitted or failed: it only reports "blocked"', () => {
    const state = classifyVerification({
      frames: [{ provider: 'Cloudflare Turnstile', text: '' }],
      pageText: [],
      submitDisabled: true,
    });
    expect(Object.keys(state).sort()).toEqual(['blocked', 'indicators']);
  });

  it('invisible reCAPTCHA badge is not a challenge', () => {
    expect(
      isInvisibleWidget(
        'https://www.google.com/recaptcha/enterprise/anchor?k=x&size=invisible',
      ),
    ).toBe(true);
    expect(
      isInvisibleWidget(
        'https://www.google.com/recaptcha/api2/anchor?k=x&size=normal',
      ),
    ).toBe(false);
  });
});
