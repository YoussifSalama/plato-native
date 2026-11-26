"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, KeyRound, Loader2, MailCheck, Send, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { StatIcon, type Accent } from "@/components/plato-ui"
import { forgotPassword, resetPassword, verifyEmail } from "@/lib/auth/api"
import { passwordSchema } from "@/lib/auth/schema"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { spring } from "@/lib/motion-system"

// Forgot password, choose a new one, confirm the email: the small screens
// behind the links Plato emails. Same frame and voice as log in.

function Heading({ icon: Icon, accent, title, body }: { icon: typeof KeyRound; accent?: Accent; title: string; body: ReactNode }) {
  return (
    <motion.div variants={fadeUpItem} className="flex flex-col gap-3">
      <StatIcon icon={Icon} accent={accent} className="size-11 rounded-xl [&_svg]:size-5" />
      <h1 className="type-page-title text-foreground">{title}</h1>
      <p className="type-body text-text-secondary">{body}</p>
    </motion.div>
  )
}

function Done({ title, body, cta, href }: { title: string; body: ReactNode; cta: string; href: string }) {
  const reduced = !!useReducedMotion()
  return (
    <motion.div initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.enter} className="flex flex-col gap-5">
      <motion.span initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.enter, delay: 0.1 }} className="w-fit">
        <StatIcon icon={CheckCircle2} accent="green" className="size-12 rounded-full [&_svg]:size-6" />
      </motion.span>
      <div className="flex flex-col gap-1.5">
        <h1 className="type-page-title text-foreground">{title}</h1>
        <p className="type-body text-text-secondary">{body}</p>
      </div>
      <Link href={href} className={cn(buttonVariants(), CTA)}>
        {cta}
        <ArrowRight className={ARROW} />
      </Link>
    </motion.div>
  )
}

// The one main action per screen, the same lift and arrow nudge as log in.
const CTA = "group/cta h-11 w-full shadow-md shadow-primary/30 transition-[background-color,box-shadow] duration-200 hover:shadow-lg hover:shadow-primary/40"
const ARROW = "size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5"

const BackToLogin = () => (
  <Link href="/login" className="group/back mx-auto flex w-fit items-center gap-1 text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
    <ArrowLeft className="size-3.5 transition-transform duration-200 group-hover/back:-translate-x-0.5" />
    Back to log in
  </Link>
)

// A failed request: white with a thin red edge, never a red block.
const FormError = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="flex items-start gap-2 rounded-lg border border-l-[3px] border-l-destructive bg-card px-3 py-2.5 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1 duration-200">
    <CircleAlert className="mt-0.5 size-4 shrink-0" />
    <span>{children}</span>
  </p>
)

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle")
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setState("busy")
    try {
      await forgotPassword(email.trim())
      setState("sent")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setState("idle")
    }
  }

  if (state === "sent")
    return (
      <Done
        title="Check your email"
        body={
          <>
            If <span className="font-semibold text-foreground">{email.trim()}</span> has a Plato account, a link to choose a new password is on its way. It works once and expires in an hour. Nothing there? Check spam, or try again in a minute.
          </>
        }
        cta="Back to log in"
        href="/login"
      />
    )

  return (
    <motion.form initial="hidden" animate="show" variants={staggerContainer} onSubmit={submit} className="flex w-full flex-col gap-5">
      <Heading icon={KeyRound} title="Forgot your password?" body="Enter the email you signed up with and we'll send you a link to choose a new one." />
      <motion.div variants={fadeUpItem}>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="eg. john.doe@example.com" />
        </Field>
      </motion.div>
      {error && <FormError>{error}</FormError>}
      <motion.div variants={fadeUpItem}>
        <Button type="submit" disabled={state === "busy" || !email.trim()} className={CTA}>
          {state === "busy" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send me a link
        </Button>
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <BackToLogin />
      </motion.div>
    </motion.form>
  )
}

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")
  const [error, setError] = useState<string | null>(null)
  const mismatch = confirm.length > 0 && confirm !== password
  // The same rule as sign-up and change password (8 characters, at most 72 bytes).
  const tooLong = password.length >= 8 && !passwordSchema.safeParse(password).success

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!passwordSchema.safeParse(password).success || mismatch) return
    setError(null)
    setState("busy")
    try {
      await resetPassword(token, password)
      setState("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setState("idle")
    }
  }

  if (!token)
    return (
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="flex flex-col gap-5">
        <Heading icon={TriangleAlert} accent="amber" title="This link is incomplete" body="Open the link from the email again, or ask for a new one." />
        <Link href="/forgot-password" className={cn(buttonVariants(), CTA)}>
          Ask for a new link
          <ArrowRight className={ARROW} />
        </Link>
      </motion.div>
    )

  if (state === "done") return <Done title="Your password is changed" body="For your safety, every device that was signed in has been signed out. Log in with your new password." cta="Log in" href="/login" />

  return (
    <motion.form initial="hidden" animate="show" variants={staggerContainer} onSubmit={submit} className="flex w-full flex-col gap-5">
      <Heading icon={KeyRound} title="Choose a new password" body="At least 8 characters. You'll be signed out everywhere else." />
      <motion.div variants={fadeUpItem} className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="eg. ••••••••" aria-invalid={tooLong} />
          {tooLong && <p className="text-xs text-destructive">Too long: use at most 72 characters (fewer with accents or emoji).</p>}
        </Field>
        <Field data-invalid={mismatch}>
          <FieldLabel htmlFor="confirm">Type it again</FieldLabel>
          <Input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="eg. ••••••••" aria-invalid={mismatch} />
          {mismatch && <p className="text-xs text-destructive">The two passwords are different.</p>}
        </Field>
      </motion.div>
      {error && (
        <FormError>
          {error}{" "}
          <Link href="/forgot-password" className="font-medium underline underline-offset-2">
            Ask for a new link
          </Link>
        </FormError>
      )}
      <motion.div variants={fadeUpItem}>
        <Button type="submit" disabled={state === "busy" || password.length < 8 || tooLong || confirm !== password} className={CTA}>
          {state === "busy" && <Loader2 className="size-4 animate-spin" />}
          Save new password
        </Button>
      </motion.div>
    </motion.form>
  )
}

// A button rather than confirming on load: mail scanners open links, people press buttons.
export function VerifyEmailCard() {
  const token = useSearchParams().get("token") ?? ""
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")
  const [error, setError] = useState<string | null>(null)
  // Set when the link was for a new address (Settings → Change email).
  const [newEmail, setNewEmail] = useState<string | null>(null)

  const confirm = async () => {
    setError(null)
    setState("busy")
    try {
      setNewEmail((await verifyEmail(token)).email ?? null)
      setState("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setState("idle")
    }
  }

  if (state === "done")
    return newEmail ? (
      <Done title="Email changed" body={<>Your account now uses <span className="font-semibold text-foreground">{newEmail}</span>: log in with it, and it goes on your applications from now on.</>} cta="Open Plato" href="/" />
    ) : (
      <Done title="Email confirmed" body="Thanks. Job alerts and account messages will now reach you by email." cta="Open Plato" href="/" />
    )

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="flex w-full flex-col gap-5">
      <Heading icon={MailCheck} title="Confirm your email" body="One press and you're set: job alerts and account messages can reach you by email." />
      {(error || !token) && <FormError>{error ?? "This link is incomplete. Open it from the email again."} You can ask for a new link from the banner in the app.</FormError>}
      <motion.div variants={fadeUpItem}>
        {token ? (
          <Button onClick={confirm} disabled={state === "busy"} className={CTA}>
            {state === "busy" && <Loader2 className="size-4 animate-spin" />}
            Confirm my email
          </Button>
        ) : (
          // No token, nothing to confirm: lead to the app, where the banner resends the link.
          <Link href="/" className={cn(buttonVariants(), CTA)}>
            Open Plato
            <ArrowRight className={ARROW} />
          </Link>
        )}
      </motion.div>
    </motion.div>
  )
}
