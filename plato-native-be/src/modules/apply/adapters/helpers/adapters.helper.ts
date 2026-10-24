import { Injectable } from '@nestjs/common';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

@Injectable()
export class AdapterHelper {
  async savePageData(
    adaptor: 'workable' | 'lever',
    html: string,
    cookies: string,
    pageUrl: string,
  ) {
    const dir = path.join(process.cwd(), 'core');

    await mkdir(dir, { recursive: true });

    const filepath = path.join(dir, `${adaptor}-${Date.now()}.json`);

    const parsedCookies = JSON.parse(cookies);

    const cookieMap = Object.fromEntries(
      parsedCookies.map((cookie: { name: string; value: string }) => [
        cookie.name,
        cookie.value,
      ]),
    );

    const cookiesKeys = {
      cf_clearance: cookieMap['cf_clearance'],
      __cf_bm: cookieMap['__cf_bm'],
      'koa.sess': cookieMap['koa.sess'],
      'koa.sess.sig': cookieMap['koa.sess.sig'],
      _session: cookieMap['_session'],
      '_session.sig': cookieMap['_session.sig'],
      _grant: cookieMap['_grant'],
      '_grant.sig': cookieMap['_grant.sig'],
    };

    const siteKey =
      html.match(/"turnstileWidgetSiteKey"\s*:\s*"([^"]+)"/)?.[1] ??
      html.match(/data-sitekey=["']([^"']+)["']/i)?.[1] ??
      null;

    const action =
      html.match(/data-action=["']([^"']+)["']/i)?.[1] ??
      html.match(/["']action["']\s*:\s*["']([^"']+)["']/i)?.[1] ??
      null;

    const cData =
      html.match(/data-cdata=["']([^"']+)["']/i)?.[1] ??
      html.match(/["']cData["']\s*:\s*["']([^"']+)["']/i)?.[1] ??
      null;

    const captcha = {
      enabled: /"wjb_acp_turnstile_captcha_enabled"\s*:\s*true/.test(html),

      siteKey,

      action,

      cData,

      script: html.includes(
        'https://challenges.cloudflare.com/turnstile/v0/api.js',
      ),
    };

    const pageData = {
      adaptor,
      timestamp: new Date().toISOString(),

      cookies: cookiesKeys,

      captcha,

      pageUrl,
    };

    await writeFile(filepath, JSON.stringify(pageData, null, 2), 'utf8');

    return filepath;
  }
}
