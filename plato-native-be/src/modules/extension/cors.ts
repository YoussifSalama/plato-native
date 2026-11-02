import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';

// Extension routes: the fixed extension origin only, no credentials (the
// extension sends a Bearer token, never cookies). Everything else: the web app.
export const isExtensionRoute = (url = '') =>
  url.startsWith('/extension/v1') ||
  url.startsWith('/extension/pairing/exchange');

export function corsFor(
  req: Pick<Request, 'url'>,
  web: string,
  ext: string | undefined, // one origin, or several comma-separated (dev build id, store id)
): CorsOptions {
  const origins = (ext ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (isExtensionRoute(req.url))
    return {
      origin: origins.length > 1 ? origins : origins[0] || false,
      credentials: false,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    };
  return { origin: web, credentials: true };
}
