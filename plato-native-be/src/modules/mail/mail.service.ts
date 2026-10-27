import { Injectable, Logger } from '@nestjs/common';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  // One-click unsubscribe (RFC 8058), shown by Gmail and Apple Mail next to the sender.
  unsubscribeUrl?: string;
  // Groups the mail in SendGrid's stats ("job-alerts").
  category?: string;
}

// Email through SendGrid's v3 API. Without SENDGRID_API_KEY and MAIL_FROM it
// sends nothing and says so: in-app notifications still work.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  get enabled() {
    return !!process.env.SENDGRID_API_KEY && !!process.env.MAIL_FROM;
  }

  async send(mail: Mail): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug(
        `Mail off (no SENDGRID_API_KEY/MAIL_FROM): ${mail.subject}`,
      );
      return false;
    }
    const body = {
      personalizations: [{ to: [{ email: mail.to }] }],
      from: {
        email: process.env.MAIL_FROM,
        name: process.env.MAIL_FROM_NAME || 'Plato',
      },
      subject: mail.subject,
      content: [
        { type: 'text/plain', value: mail.text },
        { type: 'text/html', value: mail.html },
      ],
      ...(mail.category && { categories: [mail.category] }),
      ...(mail.unsubscribeUrl && {
        headers: {
          'List-Unsubscribe': `<${mail.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    };
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return true;
      this.logger.warn(
        `SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    } catch (err) {
      this.logger.warn(`SendGrid failed: ${String(err)}`);
    }
    return false;
  }
}
