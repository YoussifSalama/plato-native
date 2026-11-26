import { Logger } from '@nestjs/common';
import { MailService } from './mail.service';

describe('MailService at boot', () => {
  const env = { ...process.env };
  afterEach(() => (process.env = { ...env }));

  it('logs an error when production has no mail settings, and stays quiet in development', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    delete process.env.SENDGRID_API_KEY;
    process.env.NODE_ENV = 'development';
    new MailService().onModuleInit();
    expect(error).not.toHaveBeenCalled();
    process.env.NODE_ENV = 'production';
    new MailService().onModuleInit();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Mail is OFF'));
  });
});
