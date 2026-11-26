import { z } from "zod"

// Accept what people actually type — "+20 (100) 123-4567" — and store E.164, always with the "+"
// (the backend does the same, so "2010…" and "+2010…" are one number).
export const normalizePhone = (raw: string) => {
  const v = raw.replace(/[\s().-]/g, "").replace(/^00/, "+")
  return v.startsWith("+") ? v : `+${v}`
}
const E164 = /^\+[1-9]\d{6,14}$/
export const phoneSchema = z
  .string()
  .min(1, "Phone is required")
  .transform(normalizePhone)
  .refine((v) => E164.test(v), "Enter a valid phone number with country code, e.g. +20 100 123 4567")

export const fullNameSchema = z.string().trim().min(1, "Full name is required").max(100, "Full name must be at most 100 characters")

// bcrypt reads only the first 72 bytes: refuse longer rather than cut it. Same rule for sign-up, reset and change.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((p) => new TextEncoder().encode(p).length <= 72, "Password is too long: use at most 72 characters (fewer with accents or emoji)")

export const signupSchema = z.object({
  fullName: fullNameSchema,
  email: z.string().email("Enter a valid email"),
  phone: phoneSchema,
  password: passwordSchema,
  termsAccepted: z.literal(true, { message: "You must accept the terms" }),
})

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

export type SignupFormValues = z.infer<typeof signupSchema>
export type LoginFormValues = z.infer<typeof loginSchema>
