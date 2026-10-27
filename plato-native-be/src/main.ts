import 'dotenv/config';
import dns from 'node:dns';
import net from 'node:net';
// No IPv6 route here: Node's happy-eyeballs gives IPv4 only 250ms, then fails
// on IPv6 (ENETUNREACH). Go IPv4 first, one attempt, normal OS timeout.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { corsFor } from './modules/extension/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Engine v3 turn results carry screenshots (base64 PNG, up to a few MB); the default 100kb json limit refused them (413).
  app.useBodyParser('json', { limit: '12mb' });
  // No public file serving: CVs live in private storage and are read through the API.
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
