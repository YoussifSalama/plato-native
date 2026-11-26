import { z } from 'zod';

// Mirrors the frontend rule: strip formatting, always store E.164 with the "+",
// so "201005550401" and "+201005550401" are one number to the unique index.
export const normalizePhone = (raw: string) => {
  const v = raw.replace(/[\s().-]/g, '').replace(/^00/, '+');
  return v.startsWith('+') ? v : `+${v}`;
};
export const E164 = /^\+[1-9]\d{6,14}$/;
const phoneSchema = z
  .string()
  .min(1, 'Phone is required')
  .transform(normalizePhone)
  .refine((v) => E164.test(v), 'Enter a valid phone number with country code');

const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Full name is required')
  .max(100, 'Full name must be at most 100 characters');

// Stored and looked up lowercase: phones capitalize the first letter, so "Ali@x.com" must log in as "ali@x.com".
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email');

// bcrypt reads only the first 72 bytes: refuse longer rather than cut it without a word.
// One rule for sign-up, reset and change.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(
    (p) => Buffer.byteLength(p, 'utf8') <= 72,
    'Password is too long: use at most 72 characters (fewer with accents or emoji)',
  );

export const signupSchema = z.object({
  full_name: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

export const forgotSchema = z.object({
  email: emailSchema,
});

export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// Settings → Account. Email has its own flow (a link to the new address).
export const updateMeSchema = z
  .object({ full_name: fullNameSchema, phone: phoneSchema })
  .partial()
  .refine((v) => v.full_name !== undefined || v.phone !== undefined, {
    message: 'Nothing to change',
  });

export const changePasswordSchema = z.object({
  current: z.string().min(1, 'Enter your current password'),
  next: passwordSchema,
});

export const changeEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

// Deleting the account asks for the password again.
export const passwordConfirmSchema = z.object({
  password: z.string().min(1, 'Enter your password'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
