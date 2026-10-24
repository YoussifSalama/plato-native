import { checkSalary } from './salary-sanity';

const base = {
  currency: 'USD',
  period: 'MONTHLY' as const,
  residence: 'EG',
  targets: ['CA'],
  remote: true,
};

describe('checkSalary', () => {
  it('flags 1000 USD/month as low for someone working in Canada', () => {
    const v = checkSalary({
      ...base,
      amount: 1000,
      residence: 'CA',
      remote: false,
    });
    expect(v?.verdict).toBe('low');
    expect(v?.note).toMatch(/Lower than usual/);
  });

  it('flags 8000 USD/month remote-from-Egypt as high', () => {
    expect(checkSalary({ ...base, amount: 9000 })?.verdict).toBe('high');
  });

  it('accepts the usual remote-abroad range from Egypt', () => {
    expect(checkSalary({ ...base, amount: 3500 })?.verdict).toBe('ok');
  });

  it('flags a tiny remote-abroad ask as low', () => {
    expect(checkSalary({ ...base, amount: 500 })?.verdict).toBe('low');
  });

  it('converts currency and yearly pay', () => {
    // 60,000 EGP / month ≈ 1,200 USD: fine locally in Egypt
    const local = checkSalary({
      ...base,
      amount: 60000,
      currency: 'EGP',
      targets: ['EG'],
      remote: false,
    });
    expect(local?.monthlyUsd).toBe(1200);
    expect(local?.verdict).toBe('ok');
    expect(
      checkSalary({
        ...base,
        amount: 60000,
        period: 'YEARLY',
        targets: ['US'],
        residence: 'US',
        remote: false,
      })?.monthlyUsd,
    ).toBe(5000);
  });

  it('does not judge what it cannot place', () => {
    expect(checkSalary({ ...base, amount: 1000, currency: 'XYZ' })).toBeNull();
    expect(
      checkSalary({ ...base, amount: 1000, residence: null, targets: [] }),
    ).toBeNull();
  });
});
