// Auto-link: when the seeker is logged in on the Plato web app, the page hands the extension
// a one-time pairing code it made with that session, and the extension does the same exchange
// a typed code does. The login itself never leaves the web app, and the extension token never
// leaves the extension: this handler answers only "linked or not".
import type { TokenStore } from './token-store';

export type AutoLinkMessage = { type: 'plato:status' } | { type: 'plato:pair'; code: string };
export type AutoLinkReply = { installed: true; linked: boolean; error?: string };

const CODE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/;

// "Chrome on macOS": the name shown on Plato's Extension page.
export function browserName(ua: string = globalThis.navigator?.userAgent ?? ''): string {
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `Chrome on ${os}` : 'This browser';
}

export function createAutoLink(d: {
  webOrigin: string;
  tokens: Pick<TokenStore, 'get' | 'set'>;
  exchange: (code: string, deviceLabel: string, version: string) => Promise<{ token: string }>;
  version: string;
  onLinked: () => void;
}) {
  return async (msg: unknown, senderOrigin: string | undefined): Promise<AutoLinkReply | null> => {
    // Only the Plato web app, only these two messages. Anything else gets no answer at all.
    if (senderOrigin !== d.webOrigin || !msg || typeof msg !== 'object') return null;
    const m = msg as Partial<AutoLinkMessage> & { code?: unknown };
    const linked = async () => !!(await d.tokens.get().catch(() => null));
    if (m.type === 'plato:status') return { installed: true, linked: await linked() };
    if (m.type !== 'plato:pair' || typeof m.code !== 'string' || !CODE.test(m.code.trim())) return null;
    // Already linked: keep the existing link (the seeker unlinks on purpose, never by accident).
    if (await linked()) return { installed: true, linked: true };
    try {
      const r = await d.exchange(m.code.trim(), browserName(), d.version);
      await d.tokens.set(r.token);
      d.onLinked();
      return { installed: true, linked: true };
    } catch {
      return { installed: true, linked: false, error: 'Could not link. Use a code from the Extension page.' };
    }
  };
}
