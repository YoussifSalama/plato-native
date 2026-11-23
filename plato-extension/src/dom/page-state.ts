import { isVisible } from './inspect';

// Read-only facts about the current page, for provider adapters: is there an application
// form, did a human check appear, was the posting closed, is there a confirmation. It reads
// text and structure only: nothing is clicked, typed or sent. Wording is deliberately narrow:
// a clear marker becomes "confirmed", anything vague stays "unknown" (which means VERIFY).
export interface PageState {
  href: string;
  formPresent: boolean;
  captcha: boolean;
  closed: boolean;
  confirmed: string | null; // the marker text/URL that proves a submission, if any
  kind: PageKind; // what this page is, from its structure alone (the brain gets it as a hint; its own reading wins)
  fields: number; // visible form fields
  sig: string; // kind + URL + every visible field and its value: unchanged after an action = the action did nothing (loop check)
}
// Engine v3 stops before the brain acts on ACCOUNT_SIGNUP / LOGIN (the seeker's "create accounts" setting off),
// EMAIL_VERIFICATION and CAPTCHA. UNKNOWN here is only "no rule matched" (a loading page, a landing page): it is
// passed on as a hint, never a stop; the brain's own UNKNOWN_PAGE answer is what stops for an unknown page.
export type PageKind = 'APPLICATION_FORM' | 'ACCOUNT_SIGNUP' | 'LOGIN' | 'EMAIL_VERIFICATION' | 'CAPTCHA' | 'SUBMITTED' | 'JOB_DESCRIPTION' | 'UNKNOWN';

const CONFIRM_TEXT = /(thank you for applying|thanks for applying|your application (has been|was) (submitted|received|sent)|application (submitted|received|sent)|we(?:'|’)?ve received your application|\bapplied \d+\s?(?:mo|[mhdw]|minutes?|hours?|days?|weeks?|months?) ago\b)/i;
const CONFIRM_PATH = /\/(confirmation|thanks|thank-you|application-submitted)(\/|$|\?)/i;
const CLOSED_TEXT = /(no longer (available|accepting|open)|position (has been|is) (filled|closed)|job (is )?(no longer|not found)|this job (has expired|is closed)|page you(?:'|’)?re looking for)/i;
// An email-only "enter your email to apply" step has no password box: it is never ACCOUNT_SIGNUP or LOGIN here.
const SIGNUP_TEXT = /\b(create (an |your )?account|sign up|register now|confirm (your )?password|re-?enter (your )?password|choose a password)\b/i;
const SIGNUP_PATH = /\/(sign-?up|register|registration|create-?account|join)(\/|$|\?)/i;
const FORGOT_TEXT = /forgot (your )?password/i;
const VERIFY_TEXT = /(verify your email|confirm your email|check your (email|inbox)|we(?:'|’)?ve (just )?sent (you )?(a|an|the) (\d-digit )?(code|link|email)|enter the (\d-digit )?(code|verification code)|verification code)/i;
const OTP_NAME = /\b(otp|one.?time|verification.?code|passcode|security.?code)\b/i;
const APPLY_CONTROL = /^\s*(apply|apply now|apply for this (job|position|role)|easy apply|apply on company (site|website)|i(?:'|’)?m interested)\s*$/i;
const HUMAN_TEXT = /(verify (that )?you(?:'|’)?re (a )?human|verify you are (a )?human|are you a robot|complete the security check)/i;

export function pageState(doc: Document): PageState {
  const text = (doc.body?.innerText ?? doc.body?.textContent ?? '').slice(0, 20000); // textContent: jsdom (tests) has no innerText
  const href = doc.location?.href ?? '';
  const url = (() => {
    try {
      return new URL(href);
    } catch {
      return undefined;
    }
  })();
  const confirmed = CONFIRM_PATH.test(url?.pathname ?? '') ? `url:${url!.pathname}` : (CONFIRM_TEXT.exec(text)?.[0] ?? null);
  const fields = Array.from(doc.querySelectorAll<HTMLInputElement>('input,textarea,select')).filter((c) => !['hidden', 'submit', 'button', 'image'].includes(c.type) && isVisible(c, doc));
  const formPresent = !confirmed && !!doc.querySelector('form') && fields.length >= 2;
  const frames = Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe')).filter((f) => /hcaptcha|challenges\.cloudflare|turnstile|recaptcha\/(api2|enterprise)\/bframe/i.test(f.src) && isVisible(f, doc));
  const captcha = frames.length > 0 || HUMAN_TEXT.test(text);
  const pw = fields.filter((f) => f.type === 'password').length;
  const otp = fields.some((f) => f.getAttribute('autocomplete') === 'one-time-code' || OTP_NAME.test(`${f.name} ${f.id}`)) || fields.filter((f) => f.getAttribute('maxlength') === '1').length >= 4;
  const path = url?.pathname ?? '';
  const kind: PageKind = confirmed ? 'SUBMITTED'
    : captcha ? 'CAPTCHA'
    : otp || (!pw && fields.length <= 2 && VERIFY_TEXT.test(text)) ? 'EMAIL_VERIFICATION'
    : pw >= 2 || (pw === 1 && (SIGNUP_PATH.test(path) || (!FORGOT_TEXT.test(text) && SIGNUP_TEXT.test(text)))) ? 'ACCOUNT_SIGNUP'
    : pw === 1 ? 'LOGIN'
    : fields.length >= 2 ? 'APPLICATION_FORM'
    : Array.from(doc.querySelectorAll('a,button,[role="button"]')).some((b) => APPLY_CONTROL.test(b.textContent ?? '')) ? 'JOB_DESCRIPTION'
    : 'UNKNOWN';
  // a password's value never goes into the signature, only whether it is filled
  const value = (f: HTMLInputElement) => (f.type === 'password' ? (f.value ? '•' : '') : f.type === 'checkbox' || f.type === 'radio' ? String(f.checked) : f.value);
  const sig = [kind, url ? url.origin + url.pathname + url.search : href, ...fields.slice(0, 80).map((f) => `${f.name || f.id}=${value(f)}`)].join('\n');
  return { href, formPresent, captcha, closed: !formPresent && !confirmed && CLOSED_TEXT.test(text), confirmed, kind, fields: fields.length, sig };
}
