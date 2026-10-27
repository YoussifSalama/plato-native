"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { CheckCircle2, KeyRound, Loader2, MailCheck, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { forgotPassword, resetPassword, verifyEmail } from "@/lib/auth/api"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { spring } from "@/lib/motion-system"

// Forgot password, choose a new one, confirm the email: the small screens
// behind the links Plato emails. Same frame and voice as log in.

function Heading({ icon: Icon, title, body }: { icon: typeof KeyRound; title: string; body: ReactNode }) {
  return (
    <motion.div variants={fadeUpItem} className="flex flex-col gap-3">
      <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-5" />
      </span>
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{body}</p>
    </motion.div>
  )
}

function Done({ title, body, cta, href }: { title: string; body: ReactNode; cta: string; href: string }) {
  const reduced = !!useReducedMotion()
  return (
    <motion.div initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.enter} className="flex flex-col gap-5">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{body}</p>
      </div>
      <Link href={href} className={cn(buttonVariants(), "w-full shadow-md shadow-primary/30")}>
        {cta}
      </Link>
    </motion.div>
  )
}

const BackToLogin = () => (
  <a href="/login" className="block text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
    Back to log in
  </a>
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <motion.div variants={fadeUpItem}>
        <Button type="submit" disabled={state === "busy" || !email.trim()} className="w-full shadow-md shadow-primary/30">
          {state === "busy" && <Loader2 className="size-4 animate-spin" />}
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
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")
  const [error, setError] = useState<string | null>(null)
  const mismatch = confirm.length > 0 && confirm !== password

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8 || mismatch) return
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
      <div className="flex flex-col gap-5">
        <Heading icon={TriangleAlert} title="This link is incomplete" body="Open the link from the email again, or ask for a new one." />
        <Button onClick={() => router.push("/forgot-password")} className="w-full">
          Ask for a new link
        </Button>
      </div>
    )

  if (state === "done") return <Done title="Your password is changed" body="For your safety, every device that was signed in has been signed out. Log in with your new password." cta="Log in" href="/login" />

  return (
    <motion.form initial="hidden" animate="show" variants={staggerContainer} onSubmit={submit} className="flex w-full flex-col gap-5">
      <Heading icon={KeyRound} title="Choose a new password" body="At least 8 characters. You'll be signed out everywhere else." />
      <motion.div variants={fadeUpItem} className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="eg. ••••••••" />
        </Field>
        <Field data-invalid={mismatch}>
          <FieldLabel htmlFor="confirm">Type it again</FieldLabel>
          <Input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="eg. ••••••••" aria-invalid={mismatch} />
          {mismatch && <p className="text-xs text-destructive">The two passwords are different.</p>}
        </Field>
      </motion.div>
      {error && (
        <p className="text-sm text-destructive">
          {error}{" "}
          <a href="/forgot-password" className="font-medium underline">
            Ask for a new link
          </a>
        </p>
      )}
      <motion.div variants={fadeUpItem}>
        <Button type="submit" disabled={state === "busy" || password.length < 8 || confirm !== password} className="w-full shadow-md shadow-primary/30">
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

  const confirm = async () => {
    setError(null)
    setState("busy")
    try {
      await verifyEmail(token)
      setState("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setState("idle")
    }
  }

  if (state === "done") return <Done title="Email confirmed" body="Thanks. Job alerts and account messages will now reach you by email." cta="Open Plato" href="/jobs" />

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="flex w-full flex-col gap-5">
      <Heading icon={MailCheck} title="Confirm your email" body="One press and you're set: job alerts and account messages can reach you by email." />
      {(error || !token) && <p className="text-sm text-destructive">{error ?? "This link is incomplete. Open it from the email again."} You can ask for a new link from the banner in the app.</p>}
      <motion.div variants={fadeUpItem}>
        <Button onClick={confirm} disabled={state === "busy" || !token} className="w-full shadow-md shadow-primary/30">
          {state === "busy" && <Loader2 className="size-4 animate-spin" />}
          Confirm my email
        </Button>
      </motion.div>
    </motion.div>
  )
}
