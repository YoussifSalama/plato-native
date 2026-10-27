import 'dotenv/config';
// First, so error reporting can hook into everything loaded after it.
import './instrument';
import dns from 'node:dns';
import net from 'node:net';
// No IPv6 route here: Node's happy-eyeballs gives IPv4 only 250ms, then fails
// on IPv6 (ENETUNREACH). Go IPv4 first, one attempt, normal OS timeout.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { corsFor } from './modules/extension/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Engine v3 turn results carry screenshots (base64 PNG, up to a few MB); the default 100kb json limit refused them (413).
  app.useBodyParser('json', { limit: '12mb' });
  // No public file serving: CVs live in private storage and are read through the API.
  // Behind a proxy (load balancer, Render, Nginx...) set TRUST_PROXY (e.g. 1) so
  // req.ip is the visitor's address, not the proxy's: the rate limits key on it.
  if (process.env.TRUST_PROXY)
    app.set(
      'trust proxy',
      /^\d+$/.test(process.env.TRUST_PROXY)
        ? Number(process.env.TRUST_PROXY)
        : process.env.TRUST_PROXY,
    );
  // Standard protective headers. No CSP: this is a JSON API (the one HTML page,
  // the live browser viewer, uses an inline script). Cross-origin reads stay
  // allowed so the web app on its own origin can show screenshots and PDFs.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  // Per route: web app + cookies, or (extension routes) the extension origin
  // only, no cookies.
  app.enableCors((req, cb) =>
    cb(
      null,
      corsFor(
        req,
        process.env.FRONTEND_URL ?? 'http://localhost:3001',
        process.env.EXTENSION_ORIGIN,
      ),
    ),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
