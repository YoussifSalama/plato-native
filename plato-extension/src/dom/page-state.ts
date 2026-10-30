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
}

const CONFIRM_TEXT = /(thank you for applying|thanks for applying|your application (has been|was) (submitted|received|sent)|application (submitted|received|sent)|we(?:'|’)?ve received your application|\bapplied \d+\s?(?:mo|[mhdw]|minutes?|hours?|days?|weeks?|months?) ago\b)/i;
const CONFIRM_PATH = /\/(confirmation|thanks|thank-you|application-submitted)(\/|$|\?)/i;
const CLOSED_TEXT = /(no longer (available|accepting|open)|position (has been|is) (filled|closed)|job (is )?(no longer|not found)|this job (has expired|is closed)|page you(?:'|’)?re looking for)/i;
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
  return { href, formPresent, captcha: frames.length > 0 || HUMAN_TEXT.test(text), closed: !formPresent && !confirmed && CLOSED_TEXT.test(text), confirmed };
}
