import { changePasswordSchema, resetSchema, signupSchema } from './auth.schema';

const base = {
  full_name: 'Mona Ali',
  email: 'mona@example.com',
  phone: '+201005550401',
  password: 'password123',
};

describe('auth schemas', () => {
  it('stores one form of a phone, with or without the +', () => {
    const a = signupSchema.parse({ ...base, phone: '201005550401' });
    const b = signupSchema.parse({ ...base, phone: '+20 100 555 0401' });
    const c = signupSchema.parse({ ...base, phone: '00201005550401' });
    expect([a.phone, b.phone, c.phone]).toEqual([
      '+201005550401',
      '+201005550401',
      '+201005550401',
    ]);
  });

  it('refuses a blank name and trims a real one', () => {
    expect(signupSchema.safeParse({ ...base, full_name: '   ' }).success).toBe(
      false,
    );
    expect(signupSchema.parse({ ...base, full_name: ' Mona ' }).full_name).toBe(
      'Mona',
    );
  });

  it('refuses a password bcrypt would cut (over 72 bytes) at sign-up, reset and change', () => {
    const long = 'é'.repeat(37); // 74 bytes, 37 characters
    expect(signupSchema.safeParse({ ...base, password: long }).success).toBe(
      false,
    );
    expect(
      resetSchema.safeParse({ token: 'x'.repeat(30), password: long }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ current: 'a', next: long }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({ ...base, password: 'a'.repeat(72) }).success,
    ).toBe(true);
  });
});
