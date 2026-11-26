import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailService } from './modules/mail/mail.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, MailService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  it('health reports mail off as degraded in production', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.SENDGRID_API_KEY;
    expect(appController.health()).toEqual({ status: 'degraded', mail: 'off' });
    process.env.NODE_ENV = env;
  });
});
