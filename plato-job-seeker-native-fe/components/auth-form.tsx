"use client"

import { type ReactNode, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion } from "motion/react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { RequiredMark } from "@/app/onboarding/components/required-mark"
import { SuccessModal } from "@/components/success-modal"
import { getMe, login, signup } from "@/lib/auth/api"
import { loginSchema, signupSchema, type LoginFormValues, type SignupFormValues } from "@/lib/auth/schema"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

function OAuthButtons() {
  return (
    <motion.div variants={fadeUpItem} className="flex flex-col gap-2">
      {/* ponytail: OAuth is visual-only until real Google/LinkedIn auth is built */}
      <Button type="button" variant="outline" className="h-11 justify-start gap-2.5" disabled>
        <span className="flex size-7 items-center justify-center rounded-full bg-white text-md font-bold text-[#4285F4] ring-1 ring-black/10">
          G
        </span>
        Continue with Google
      </Button>
    </motion.div>
  )
}

function OrDivider() {
  return (
    <motion.div variants={fadeUpItem} className="flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-xs text-muted-foreground">or</span>
      <Separator className="flex-1" />
    </motion.div>
  )
}

function AuthFormShell({
  heading,
  subheading,
  children,
  formError,
  submitLabel,
  isSubmitting,
  onSubmit,
  footer,
}: {
  heading: string
  subheading: string
  children: ReactNode
  formError: string | null
  submitLabel: string
  isSubmitting: boolean
  onSubmit: () => void
  footer: ReactNode
}) {
  return (
    <motion.form
      initial="hidden"
      animate="show"
      variants={staggerContainer}
      className="flex w-full flex-col gap-5"
      onSubmit={onSubmit}
    >
      <motion.div variants={fadeUpItem} className="flex flex-col gap-1.5">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          {heading}
          <motion.span
            animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" as const }}
          >
            <Sparkles className="size-5 text-primary" />
          </motion.span>
        </h2>
        <p className="text-sm text-text-secondary">{subheading}</p>
      </motion.div>

      <OAuthButtons />
      <OrDivider />

      <FieldGroup>{children}</FieldGroup>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <motion.div
        variants={fadeUpItem}
        whileHover={!isSubmitting ? { scale: 1.02 } : undefined}
        whileTap={!isSubmitting ? { scale: 0.98 } : undefined}
      >
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full shadow-md shadow-primary/30 transition-shadow hover:shadow-lg hover:shadow-primary/40"
        >
          {submitLabel}
        </Button>
      </motion.div>

      <motion.div variants={fadeUpItem}>{footer}</motion.div>
    </motion.form>
  )
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="block text-center text-sm text-text-secondary">
      {label.split("? ")[0]}?{" "}
      <span className="font-medium text-primary underline-offset-4 hover:underline">{label.split("? ")[1]}</span>
    </a>
  )
}

function SignupForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      termsAccepted: false as unknown as true,
    },
  })

  useEffect(() => {
    if (!success) return
    const timeout = setTimeout(() => router.push("/onboarding"), 1400)
    return () => clearTimeout(timeout)
  }, [success, router])

  async function onSubmit(values: SignupFormValues) {
    setFormError(null)
    setIsSubmitting(true)
    try {
      await signup(values)
      setSuccess(true)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong")
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <AuthFormShell
        heading="Create your account"
        subheading="Set up once. Plato searches, ranks and applies for you from then on."
        formError={formError}
        submitLabel="Create account"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
        footer={<FooterLink href="/login" label="Already have an account? Log in" />}
      >
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="fullName">
            Full name <RequiredMark />
          </FieldLabel>
          <Input id="fullName" {...register("fullName")} placeholder={"eg. John Doe"} />
          <FieldError errors={[errors.fullName]} />
        </Field>

        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">
            Email <RequiredMark />
          </FieldLabel>
          <Input id="email" type="email" {...register("email")} placeholder={"eg. john.doe@example.com"} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.phone}>
          <FieldLabel htmlFor="phone">
            Phone <RequiredMark />
          </FieldLabel>
          <Input id="phone" type="tel" {...register("phone")} placeholder={"eg. +1 (555) 123-4567"} />
          <FieldError errors={[errors.phone]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">
            Password <RequiredMark />
          </FieldLabel>
          <Input id="password" type="password" {...register("password")} placeholder={"eg. ••••••••"} />
          <FieldError errors={[errors.password]} />
        </Field>

        <Field orientation="horizontal" data-invalid={!!errors.termsAccepted}>
          <Controller
            control={control}
            name="termsAccepted"
            render={({ field }) => (
              <Checkbox id="termsAccepted" checked={field.value === true} onCheckedChange={field.onChange} />
            )}
          />
          <FieldLabel htmlFor="termsAccepted" className="font-normal">
            I accept the{" "}
            <a href="https://platohiring.com/terms/" target="_blank" rel="noopener" className="underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="https://platohiring.com/privacy/" target="_blank" rel="noopener" className="underline">
              Privacy Policy
            </a>
          </FieldLabel>
          <FieldError errors={[errors.termsAccepted]} />
        </Field>
      </AuthFormShell>

      <SuccessModal open={success} title="Welcome to Plato!" description="Your account is ready. Next: tell Plato what you're looking for…" />
    </>
  )
}

function LoginForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginFormValues) {
    setFormError(null)
    setIsSubmitting(true)
    try {
      await login(values)
      const me = await getMe()
      router.push(me.onboarding_completed ? "/jobs" : "/onboarding")
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthFormShell
      heading="Welcome back"
      subheading="Your matches, searches and applications are where you left them."
      formError={formError}
      submitLabel="Log in"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      footer={<FooterLink href="/signup" label="New here? Create an account" />}
    >
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="email">
          Email <RequiredMark />
        </FieldLabel>
        <Input id="email" type="email" {...register("email")} placeholder={"eg. john.doe@example.com"} />
        <FieldError errors={[errors.email]} />
      </Field>

      <Field data-invalid={!!errors.password}>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="password">
            Password <RequiredMark />
          </FieldLabel>
          <a href="/forgot-password" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Forgot password?
          </a>
        </div>
        <Input id="password" type="password" {...register("password")} placeholder={"eg. ••••••••"} />
        <FieldError errors={[errors.password]} />
      </Field>
    </AuthFormShell>
  )
}

function AuthForm({ mode }: { mode: "signup" | "login" }) {
  return mode === "signup" ? <SignupForm /> : <LoginForm />
}

export { AuthForm }
