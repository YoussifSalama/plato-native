import { z } from 'zod';

// Mirrors the frontend rule: strip formatting, require E.164-ish digits.
const normalizePhone = (raw: string) =>
  raw.replace(/[\s().-]/g, '').replace(/^00/, '+');
const E164 = /^\+?[1-9]\d{6,14}$/;
const phoneSchema = z
  .string()
  .min(1, 'Phone is required')
  .transform(normalizePhone)
  .refine((v) => E164.test(v), 'Enter a valid phone number with country code');

export const signupSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Enter a valid email'),
  phone: phoneSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200);

export const forgotSchema = z.object({
  email: z.string().email('Enter a valid email'),
});

export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
