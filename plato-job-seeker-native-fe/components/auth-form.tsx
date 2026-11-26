"use client"

import { type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion } from "motion/react"
import { ArrowRight, CircleAlert, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { RequiredMark } from "@/app/onboarding/components/required-mark"
import { SuccessModal } from "@/components/success-modal"
import { InfoTip } from "@/components/info-tip"
import { getMe, login, signup } from "@/lib/auth/api"
import { claimGuest } from "@/lib/jobs/guest"
import { loginSchema, signupSchema, type LoginFormValues, type SignupFormValues } from "@/lib/auth/schema"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"

function OAuthButtons() {
  return (
    <motion.div variants={fadeUpItem} className="flex flex-col gap-2">
      {/* ponytail: OAuth is visual-only until real Google/LinkedIn auth is built */}
      <Button type="button" variant="outline" className="h-11 justify-start gap-2.5 bg-card transition-colors duration-200" disabled>
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
        <h1 className="type-page-title flex items-center gap-2 text-foreground">
          {heading}
          <motion.span
            animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" as const }}
          >
            <Sparkles className="size-5 text-primary" />
          </motion.span>
        </h1>
        <p className="type-body text-text-secondary">{subheading}</p>
      </motion.div>

      <OAuthButtons />
      <OrDivider />

      <motion.div variants={fadeUpItem}>
        <FieldGroup>{children}</FieldGroup>
      </motion.div>

      {formError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-l-[3px] border-l-destructive bg-card px-3 py-2.5 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {formError}
        </p>
      )}

      <motion.div
        variants={fadeUpItem}
        whileHover={!isSubmitting ? { scale: 1.02 } : undefined}
        whileTap={!isSubmitting ? { scale: 0.98 } : undefined}
      >
        <Button
          type="submit"
          disabled={isSubmitting}
          className="group/submit h-11 w-full shadow-md shadow-primary/30 transition-[background-color,box-shadow] duration-200 hover:shadow-lg hover:shadow-primary/40"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
          {!isSubmitting && <ArrowRight className="size-4 transition-transform duration-200 group-hover/submit:translate-x-0.5" />}
        </Button>
      </motion.div>

      <motion.div variants={fadeUpItem}>{footer}</motion.div>
    </motion.form>
  )
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group/foot block text-center text-sm text-text-secondary">
      {label.split("? ")[0]}?{" "}
      <span className="inline-flex items-center gap-1 font-semibold text-primary transition-colors duration-200 group-hover/foot:text-primary-hover">
        {label.split("? ")[1]}
        <ArrowRight className="size-3.5 transition-transform duration-200 group-hover/foot:translate-x-0.5" />
      </span>
    </Link>
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

  // Where to go after the welcome: the search made before signing up (public /search), else onboarding.
  const [next, setNext] = useState("/onboarding")
  useEffect(() => {
    if (!success) return
    const timeout = setTimeout(() => router.push(next), 1400)
    return () => clearTimeout(timeout)
  }, [success, router, next])

  async function onSubmit(values: SignupFormValues) {
    setFormError(null)
    setIsSubmitting(true)
    try {
      await signup(values)
      setNext((await claimGuest()) ?? "/onboarding")
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
        submitLabel={isSubmitting ? "Creating your account…" : "Create account"}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
        footer={<FooterLink href="/login" label="Already have an account? Log in" />}
      >
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="fullName">
            Full name <RequiredMark />
          </FieldLabel>
          <Input id="fullName" autoComplete="name" {...register("fullName")} placeholder={"eg. John Doe"} />
          <FieldError errors={[errors.fullName]} />
        </Field>

        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">
            Email <RequiredMark />
          </FieldLabel>
          <Input id="email" type="email" autoComplete="email" {...register("email")} placeholder={"eg. john.doe@example.com"} />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.phone}>
          <span className="flex items-center gap-1.5">
            <FieldLabel htmlFor="phone">
              Phone <RequiredMark />
            </FieldLabel>
            <InfoTip text="Plato puts it on the job applications it fills in for you, so employers can reach you. Include your country code." label="Why Plato needs your phone" />
          </span>
          <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} placeholder={"eg. +1 (555) 123-4567"} />
          <FieldError errors={[errors.phone]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">
            Password <RequiredMark />
          </FieldLabel>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} placeholder={"eg. ••••••••"} />
          <FieldError errors={[errors.password]} />
        </Field>

        <Field data-invalid={!!errors.termsAccepted}>
          {/* The label's links are one line of text, not flex items, and the error sits under it. */}
          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="termsAccepted"
              render={({ field }) => (
                <Checkbox id="termsAccepted" checked={field.value === true} onCheckedChange={field.onChange} className="mt-px" />
              )}
            />
            <FieldLabel htmlFor="termsAccepted" className="font-normal">
              <span>
                I accept the{" "}
                <a href="https://platohiring.com/terms/" target="_blank" rel="noopener" className="underline underline-offset-2 transition-colors duration-200 hover:text-primary">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="https://platohiring.com/privacy/" target="_blank" rel="noopener" className="underline underline-offset-2 transition-colors duration-200 hover:text-primary">
                  Privacy Policy
                </a>
              </span>
            </FieldLabel>
          </div>
          <FieldError errors={[errors.termsAccepted]} />
        </Field>
      </AuthFormShell>

      <SuccessModal open={success} title="Welcome to Plato!" description={next === "/onboarding" ? "Your account is ready. Next: tell Plato what you're looking for…" : "Your account is ready. Opening your search, with your CV already on it…"} />
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
      // A search made before logging in (public /search) opens first.
      router.push((await claimGuest()) ?? (me.onboarding_completed ? "/" : "/onboarding"))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong")
      // Only on failure: on success the button stays busy until the next page takes over.
      setIsSubmitting(false)
    }
  }

  return (
    <AuthFormShell
      heading="Welcome back"
      subheading="Your matches, searches and applications are where you left them."
      formError={formError}
      submitLabel={isSubmitting ? "Logging in…" : "Log in"}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit(onSubmit)}
      footer={<FooterLink href="/signup" label="New here? Create an account" />}
    >
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="email">
          Email <RequiredMark />
        </FieldLabel>
        <Input id="email" type="email" autoComplete="email" {...register("email")} placeholder={"eg. john.doe@example.com"} />
        <FieldError errors={[errors.email]} />
      </Field>

      <Field data-invalid={!!errors.password}>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="password">
            Password <RequiredMark />
          </FieldLabel>
          <Link href="/forgot-password" className="-my-1 py-1 text-xs font-medium text-primary underline-offset-4 transition-colors duration-200 hover:text-primary-hover hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} placeholder={"eg. ••••••••"} />
        <FieldError errors={[errors.password]} />
      </Field>
    </AuthFormShell>
  )
}

function AuthForm({ mode }: { mode: "signup" | "login" }) {
  return mode === "signup" ? <SignupForm /> : <LoginForm />
}

export { AuthForm }
