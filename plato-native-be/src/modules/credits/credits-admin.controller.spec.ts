import { NotFoundException } from '@nestjs/common';
import { CreditsAdminController } from './credits-admin.controller';

// @nestjs/config ships as ESM, which this Jest setup does not load; only its type is used
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

const config = (key: string) => ({ get: () => ({ adminReportKey: key }) });
const services = () => ({
  credits: {
    resolveUser: jest.fn().mockResolvedValue('u1'),
    adjust: jest.fn(),
    setPlan: jest.fn(),
    addTopup: jest.fn(),
    adminView: jest.fn(),
  },
  reports: { report: jest.fn() },
});

describe('CreditsAdminController', () => {
  it('without the admin key the routes do not exist (404), and neither without a configured key', async () => {
    const { credits, reports } = services();
    const c = new CreditsAdminController(
      credits as never,
      reports as never,
      config('secret-key') as never,
    );
    expect(() => c.report(undefined, '30')).toThrow(NotFoundException);
    await expect(
      c.adjust('wrong-key!', 'a@b.c', { amount: 5, reason: 'xyz' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const none = new CreditsAdminController(
      credits as never,
      reports as never,
      config('') as never,
    );
    expect(() => none.report('', '30')).toThrow(NotFoundException);
    expect(reports.report).not.toHaveBeenCalled();
    expect(credits.resolveUser).not.toHaveBeenCalled();
  });

  it('rejects a bad adjustment, an unknown plan or pack before touching anything', async () => {
    const { credits, reports } = services();
    const c = new CreditsAdminController(
      credits as never,
      reports as never,
      config('secret-key') as never,
    );
    await expect(
      c.adjust('secret-key', 'a@b.c', { amount: 'lots', reason: 'x' }),
    ).rejects.toThrow();
    await expect(
      c.plan('secret-key', 'a@b.c', { plan: 'platinum' }),
    ).rejects.toThrow();
    await expect(
      c.topup('secret-key', 'a@b.c', { pack: 'huge', ref: 'pay_1' }),
    ).rejects.toThrow();
    expect(credits.resolveUser).not.toHaveBeenCalled();
  });

  it('a valid request goes to the service for the resolved seeker', async () => {
    const { credits, reports } = services();
    const c = new CreditsAdminController(
      credits as never,
      reports as never,
      config('secret-key') as never,
    );
    await c.topup('secret-key', 'a@b.c', { pack: 'large', ref: 'invoice 42' });
    expect(credits.resolveUser).toHaveBeenCalledWith('a@b.c');
    expect(credits.addTopup).toHaveBeenCalledWith('u1', 'large', 'invoice 42');
    void c.report('secret-key', '7');
    expect(reports.report).toHaveBeenCalledWith(7);
  });
});
