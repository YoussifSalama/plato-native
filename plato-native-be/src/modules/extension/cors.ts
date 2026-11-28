import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';

// Extension routes: the fixed extension origin only, no credentials (the
// extension sends a Bearer token, never cookies). Admin routes: the admin panel
// only, with cookies. Everything else: the web app.
export const isExtensionRoute = (url = '') =>
  url.startsWith('/extension/v1') ||
  url.startsWith('/extension/pairing/exchange');

// Admin panel routes (/admin, /admin/...), not "/administrator".
export const isAdminRoute = (url = '') => /^\/admin(?:[/?#]|$)/.test(url);

export function corsFor(
  req: Pick<Request, 'url'>,
  web: string,
  ext: string | undefined, // one origin, or several comma-separated (dev build id, store id)
  admin?: string, // ADMIN_URL: the only origin for /admin/*, with cookies; unset = none
): CorsOptions {
  if (isAdminRoute(req.url)) {
    let origin: string | false = false;
    try {
      if (admin) origin = new URL(admin).origin;
    } catch {
      origin = false;
    }
    return {
      origin,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    };
  }
  const origins = (ext ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (isExtensionRoute(req.url))
    return {
      origin: origins.length > 1 ? origins : origins[0] || false,
      credentials: false,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    };
  return { origin: web, credentials: true };
}
