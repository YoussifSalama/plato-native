import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { actionEmail } from '../mail/action-email';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { tzDay } from '../usage/tz';
import { AdminInsightsService } from './admin-insights.service';

const EVERY_MS = 60 * 60_000;

/**
 * Emails the super admin what the Dashboard's "Needs your attention" shows: error spikes, stuck
 * searches, spend jumps, loss-making seekers, seekers out of tokens. Hourly; each kind at most once
 * a day (admin_alerts' unique key is the lock, so restarts and other instances never send twice).
 * ADMIN_ALERTS=off turns it off; it needs SUPER_ADMIN_EMAIL and mail (SendGrid) to send.
 */
@Injectable()
export class AdminAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AdminAlerts');
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: AdminInsightsService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    if (process.env.ADMIN_ALERTS === 'off' || !process.env.SUPER_ADMIN_EMAIL)
      return;
    const first = setTimeout(() => void this.run(), 10 * 60_000);
    const loop = setInterval(() => void this.run(), EVERY_MS);
    first.unref();
    loop.unref();
    this.timers.push(first, loop);
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
  }

  /** One pass: what needs attention now, minus what was already sent today. Never throws. */
  async run(now = new Date()) {
    try {
      const to = process.env.SUPER_ADMIN_EMAIL;
      if (!to) return { sent: 0 };
      const items = await this.insights.attention(now);
      const day = tzDay(now);
      const fresh: typeof items = [];
      for (const i of items) {
        try {
          // the insert is the lock: a second instance or a rerun today hits the unique key
          await this.prisma.adminAlert.create({
            data: { kind: i.kind, day, title: i.title },
          });
          fresh.push(i);
        } catch (e) {
          if (!(
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ))
            throw e;
        }
      }
      if (!fresh.length) return { sent: 0 };
      const base = (process.env.ADMIN_URL ?? '').replace(/\/+$/, '');
      const sent = await this.mail.send({
        to,
        ...actionEmail({
          subject:
            fresh.length === 1
              ? `Plato: ${fresh[0].title}`
              : `Plato: ${fresh.length} things need your attention`,
          name: '',
          lines: fresh.map(
            (i) =>
              `${i.severity === 'high' ? '🔴' : '🟠'} ${i.title}. ${i.detail}`,
          ),
          button: 'Open the dashboard',
          url: base ? `${base}/` : 'https://platohiring.com',
          footer:
            'Sent by the Plato admin panel at most once a day per problem. ADMIN_ALERTS=off turns these off.',
        }),
        category: 'admin-alerts',
      });
      if (!sent) {
        // mail is off or failed: free today's lock so the next pass tries again
        await this.prisma.adminAlert.deleteMany({
          where: { day, kind: { in: fresh.map((i) => i.kind) } },
        });
        return { sent: 0 };
      }
      this.logger.log(`alerted ${to}: ${fresh.map((i) => i.kind).join(', ')}`);
      return { sent: fresh.length };
    } catch (e) {
      this.logger.warn(`alerts not sent: ${(e as Error).message}`);
      return { sent: 0 };
    }
  }
}
