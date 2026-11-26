import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MailService } from './modules/mail/mail.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mail: MailService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // For uptime checks and the deploy: what is not working, without secrets.
  @Get('health')
  health() {
    const mailOk = this.mail.enabled || process.env.NODE_ENV !== 'production';
    return {
      status: mailOk ? 'ok' : 'degraded',
      mail: this.mail.enabled ? 'on' : 'off',
    };
  }
}
