import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z, type ZodType } from 'zod';
import { passwordSchema } from '../auth/auth.schema';
import { GRANTABLE_PAGES } from './admin-pages';

export const parse = <T>(schema: ZodType<T>, body: unknown): T => {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return parsed.data;
};

const OBJECT_ID = /^[a-f0-9]{24}$/;
/** A malformed id is just "not found", never a Prisma error. */
export const objectId = (id: string) => {
  if (!OBJECT_ID.test(id)) throw new NotFoundException();
  return id;
};

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email');

export const signupSchema = z.object({
  email,
  password: passwordSchema,
  superKey: z.string().max(500).optional(),
  inviteToken: z.string().max(200).optional(),
});
export type AdminSignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});
export type AdminLoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const superResetSchema = z.object({
  email,
  superKey: z.string().min(1).max(500),
  newPassword: passwordSchema.optional(),
});
export type SuperResetInput = z.infer<typeof superResetSchema>;

// "admin" is not in the enum: a role can never be granted it.
const pages = z
  .array(z.enum(GRANTABLE_PAGES))
  .max(GRANTABLE_PAGES.length * 2)
  .transform((p) => [...new Set(p)]);
const roleName = z.string().trim().min(1, 'Name is required').max(60);

export const createRoleSchema = z.object({ name: roleName, pages });
export const updateRoleSchema = z
  .object({ name: roleName.optional(), pages: pages.optional() })
  .strict();

export const updateAdminSchema = z
  .object({
    active: z.boolean().optional(),
    roleId: z.string().regex(OBJECT_ID).nullable().optional(),
  })
  .strict();

export const createInviteSchema = z.object({
  email,
  roleId: z.string().regex(OBJECT_ID, 'Pick a role'),
});
