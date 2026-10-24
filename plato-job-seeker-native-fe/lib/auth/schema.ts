import { z } from "zod"

// Accept what people actually type — "+20 (100) 123-4567" — and store E.164.
export const normalizePhone = (raw: string) => raw.replace(/[\s().-]/g, "").replace(/^00/, "+")
const E164 = /^\+?[1-9]\d{6,14}$/
export const phoneSchema = z
  .string()
  .min(1, "Phone is required")
  .transform(normalizePhone)
  .refine((v) => E164.test(v), "Enter a valid phone number with country code, e.g. +20 100 123 4567")

export const signupSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  phone: phoneSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
  termsAccepted: z.literal(true, { message: "You must accept the terms" }),
})

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

export type SignupFormValues = z.infer<typeof signupSchema>
export type LoginFormValues = z.infer<typeof loginSchema>
