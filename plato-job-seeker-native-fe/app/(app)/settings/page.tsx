"use client"

import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, Bell, Check, Download, KeyRound, Loader2, ShieldCheck, Trash2, UserRound, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CARD, SectionHeader } from "@/components/plato-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { changeEmail, changePassword, deleteAccount, exportUrl, getMe, logoutEverywhere, updateMe, type AuthUser } from "@/lib/auth/api"
import { fullNameSchema, passwordSchema, phoneSchema } from "@/lib/auth/schema"

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.")
const firstIssue = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : (r.error?.issues[0]?.message ?? "Check this field"))

// One card per section, all the same size: Account, Security, Notifications, Privacy.
function Section({ icon, title, hint, children, className }: { icon: LucideIcon; title: string; hint: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn(CARD, "flex flex-col gap-4 p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-1">
        <SectionHeader title={title} icon={icon} accent="cobalt" />
        <p className="text-sm text-text-secondary">{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Note({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-1.5 text-sm", tone === "error" ? "text-destructive" : "text-success")}>
      {tone === "ok" && <Check className="mt-0.5 size-4 shrink-0" />}
      {children}
    </p>
  )
}

export default function SettingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  useEffect(() => {
    getMe().then(setUser).catch(() => undefined)
  }, [])

  return (
    <div className={PAGE}>
      <PageHeader section="Account" title="Settings" description="Your contact details, password and sign-ins, notifications, and your data." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section icon={UserRound} title="Account" hint="Plato puts your name, email and phone on every application it fills in for you.">
          {user ? <AccountForm user={user} onSaved={setUser} /> : <FormSkeleton />}
        </Section>
        <Section icon={KeyRound} title="Security" hint="Change your password, or sign out of every device at once.">
          <SecurityForm />
        </Section>
        <Section icon={Bell} title="Notifications" hint="Job alerts arrive together in one digest, on the rhythm you choose.">
          <div className="flex flex-col divide-y divide-divider">
            <LinkRow href="/following" title="Alert settings" body="On Following, press Alert settings: how often, and in Plato or by email." />
            <LinkRow href="/notifications" title="All notifications" body="Searches, applications and digests, newest first." />
          </div>
        </Section>
        <Section icon={ShieldCheck} title="Privacy" hint="Your data is yours: take a copy, or delete it all.">
          <PrivacyActions />
        </Section>
      </div>
    </div>
  )
}

function LinkRow({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60">
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-sm text-text-secondary">{body}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  )
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-32" />
    </div>
  )
}

function AccountForm({ user, onSaved }: { user: AuthUser; onSaved: (u: AuthUser) => void }) {
  const [name, setName] = useState(user.full_name)
  const [phone, setPhone] = useState(user.phone)
  const [errors, setErrors] = useState<{ name?: string | null; phone?: string | null }>({})
  const [state, setState] = useState<{ busy?: boolean; ok?: string; error?: string }>({})

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const n = fullNameSchema.safeParse(name)
    const p = phoneSchema.safeParse(phone)
    setErrors({ name: firstIssue(n), phone: firstIssue(p) })
    if (!n.success || !p.success) return
    setState({ busy: true })
    try {
      const saved = await updateMe({ full_name: n.data, phone: p.data })
      onSaved({ ...user, ...saved })
      setName(saved.full_name)
      setPhone(saved.phone)
      setState({ ok: "Saved. New applications use these details." })
    } catch (err) {
      setState({ error: msg(err) })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="s-name">Full name</FieldLabel>
          <Input id="s-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <FieldError errors={[errors.name ? { message: errors.name } : undefined]} />
        </Field>
        <Field data-invalid={!!errors.phone}>
          <FieldLabel htmlFor="s-phone">Phone, with country code</FieldLabel>
          <Input id="s-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="eg. +20 100 123 4567" />
          <FieldError errors={[errors.phone ? { message: errors.phone } : undefined]} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={state.busy || (name === user.full_name && phone === user.phone)}>
            {state.busy && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
          {state.ok && <Note tone="ok">{state.ok}</Note>}
          {state.error && <Note tone="error">{state.error}</Note>}
        </div>
      </form>
      <EmailForm user={user} />
    </div>
  )
}

// A new email takes effect only from the link sent to it, so a typo can't lock you out.
function EmailForm({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [state, setState] = useState<{ busy?: boolean; ok?: string; error?: string }>({})

  const send = async (e: FormEvent) => {
    e.preventDefault()
    setState({ busy: true })
    try {
      const r = await changeEmail(email.trim(), password)
      setPassword("")
      setState(r.sent ? { ok: `We sent a link to ${email.trim()}. Your email changes when you open it.` } : { error: "We couldn't send the link right now. Try again in a little while." })
    } catch (err) {
      setState({ error: msg(err) })
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-divider pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-text-secondary">Email</span>
          <span className="truncate font-medium text-foreground">{user.email}</span>
          {user.email_verified === false && <span className="text-xs text-text-tertiary">Not confirmed yet</span>}
        </span>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Change email
          </Button>
        )}
      </div>
      {open && (
        <form onSubmit={send} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="s-email">New email</FieldLabel>
            <Input id="s-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-email-pw">Your password</FieldLabel>
            <Input id="s-email-pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={state.busy || !email.trim() || !password}>
              {state.busy && <Loader2 className="size-4 animate-spin" />}
              Send the link
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => (setOpen(false), setState({}))}>
              Cancel
            </Button>
          </div>
          {state.ok && <Note tone="ok">{state.ok}</Note>}
          {state.error && <Note tone="error">{state.error}</Note>}
        </form>
      )}
    </div>
  )
}

function SecurityForm() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [again, setAgain] = useState("")
  const [state, setState] = useState<{ busy?: boolean; ok?: string; error?: string }>({})
  const [confirmAll, setConfirmAll] = useState(false)
  const [allBusy, setAllBusy] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)
  const nextIssue = next ? firstIssue(passwordSchema.safeParse(next)) : null
  const mismatch = again.length > 0 && again !== next

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (nextIssue || mismatch) return
    setState({ busy: true })
    try {
      await changePassword(current, next)
      setCurrent("")
      setNext("")
      setAgain("")
      setState({ ok: "Password changed. Your other devices and linked browsers are signed out." })
    } catch (err) {
      setState({ error: msg(err) })
    }
  }

  const everywhere = async () => {
    setAllBusy(true)
    setAllError(null)
    try {
      await logoutEverywhere()
      window.location.assign("/login")
    } catch (err) {
      setAllError(msg(err))
      setAllBusy(false)
      setConfirmAll(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="s-current">Current password</FieldLabel>
          <Input id="s-current" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field data-invalid={!!nextIssue}>
          <FieldLabel htmlFor="s-next">New password</FieldLabel>
          <Input id="s-next" type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={!!nextIssue} />
          <FieldError errors={[nextIssue ? { message: nextIssue } : undefined]} />
        </Field>
        <Field data-invalid={mismatch}>
          <FieldLabel htmlFor="s-again">Type it again</FieldLabel>
          <Input id="s-again" type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={mismatch} />
          <FieldError errors={[mismatch ? { message: "The two passwords are different." } : undefined]} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={state.busy || !current || !next || !!nextIssue || again !== next}>
            {state.busy && <Loader2 className="size-4 animate-spin" />}
            Change password
          </Button>
          {state.ok && <Note tone="ok">{state.ok}</Note>}
          {state.error && <Note tone="error">{state.error}</Note>}
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">Sign out everywhere</span>
          <span className="text-sm text-text-secondary">Every device, this one too, and every linked browser extension.</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)}>
          Sign out everywhere
        </Button>
        {allError && <Note tone="error">{allError}</Note>}
      </div>
      <ConfirmDialog open={confirmAll} title="Sign out everywhere?" confirmLabel={allBusy ? "Signing out…" : "Sign out everywhere"} busy={allBusy} onConfirm={() => void everywhere()} onCancel={() => setConfirmAll(false)}>
        You&apos;ll be signed out on every device, including this one, and each linked browser extension will need linking again.
      </ConfirmDialog>
    </div>
  )
}

function PrivacyActions() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    if (!password) return setError("Enter your password to delete the account.")
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(password)
      window.location.assign("/login")
    } catch (err) {
      setError(msg(err))
      setBusy(false)
    }
  }
  const cancel = () => {
    setOpen(false)
    setPassword("")
    setError(null)
  }

  // The dialog sits outside the divided list, or the last row would get a bottom rule.
  return (
    <>
      <div className="flex flex-col divide-y divide-divider">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">Download my data</span>
            <span className="text-sm text-text-secondary">Profile, preferences, documents, searches, applications, chats and credits, as one JSON file.</span>
          </span>
          <a href={exportUrl()} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-4" />
            Download
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">Delete account</span>
            <span className="text-sm text-text-secondary">Your account, profile, files and application history, for good.</span>
          </span>
          <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
            <Trash2 className="size-4" />
            Delete account
          </Button>
        </div>
      </div>
      <ConfirmDialog open={open} danger busy={busy} title="Delete your account?" confirmLabel={busy ? "Deleting…" : "Delete my account"} onConfirm={() => void remove()} onCancel={cancel}>
        <div className="flex flex-col gap-3">
          <p>This deletes your account, profile, CVs and other files, searches, applications, chats and credits. It can&apos;t be undone. Applications already sent to employers stay with them.</p>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="s-delete-pw" className="text-foreground">
              Your password
            </FieldLabel>
            <Input id="s-delete-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void remove()} autoFocus />
          </Field>
          {error && <Note tone="error">{error}</Note>}
        </div>
      </ConfirmDialog>
    </>
  )
}
