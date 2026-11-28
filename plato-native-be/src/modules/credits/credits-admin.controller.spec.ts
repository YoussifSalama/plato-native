import { CreditsAdminController } from './credits-admin.controller';

// @nestjs/config ships as ESM, which this Jest setup does not load; only its type is used
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

// Access is the AdminGuard's job (page `credits`), tested with the admin auth.
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
const req = { admin: { id: 'a1', email: 'x@y.z', isSuper: false, pages: ['credits'] } } as never;

describe('CreditsAdminController', () => {
  it('rejects a bad adjustment, an unknown plan or pack before touching anything', async () => {
    const { credits, reports } = services();
    const c = new CreditsAdminController(credits as never, reports as never, {} as never);
    await expect(c.adjust(req, 'a@b.c', { amount: 'lots', reason: 'x' })).rejects.toThrow();
    await expect(c.plan(req, 'a@b.c', { plan: 'platinum' })).rejects.toThrow();
    await expect(c.topup(req, 'a@b.c', { pack: 'huge', ref: 'pay_1' })).rejects.toThrow();
    expect(credits.resolveUser).not.toHaveBeenCalled();
  });

  it('a valid request goes to the service for the resolved seeker', async () => {
    const { credits, reports } = services();
    const c = new CreditsAdminController(credits as never, reports as never, {} as never);
    await c.topup(req, 'a@b.c', { pack: 'large', ref: 'invoice 42' });
    expect(credits.resolveUser).toHaveBeenCalledWith('a@b.c');
    expect(credits.addTopup.mock.calls[0].slice(0, 3)).toEqual(['u1', 'large', 'invoice 42']);
    void c.report('7');
    expect(reports.report).toHaveBeenCalledWith(7);
  });
});
