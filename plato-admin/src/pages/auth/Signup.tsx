import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { AuthNext, Me } from '../../lib/types';
import { Spinner } from '../../components/ui';
import { AuthLayout, Field } from './AuthLayout';
import { authError } from './authError';
import { TotpSetupStep } from './Totp';

type Step = 'form' | 'totp_setup' | 'pending_activation';

export default function Signup() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const inviteToken = useSearchParams()[0].get('invite') ?? undefined;
  const [step, setStep] = useState<Step>('form');
  const [needKey, setNeedKey] = useState(false);
  const [f, setF] = useState({ email: '', password: '', confirm: '', superKey: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const restart = useCallback(() => setStep('form'), []);
  const done = useCallback(
    (m: Me) => {
      setMe(m);
      nav('/', { replace: true });
    },
    [setMe, nav],
  );

  if (me) return <Navigate to="/" replace />;

  const mismatch = f.confirm.length > 0 && f.password !== f.confirm;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) return;
    setBusy(true);
    try {
      const r = await api<AuthNext>('/admin/auth/signup', {
        body: { email: f.email, password: f.password, superKey: needKey ? f.superKey : undefined, inviteToken },
      });
      if (r.next === 'super_key') setNeedKey(true);
      else if (r.next === 'totp_setup') setStep('totp_setup');
      else if (r.next === 'pending_activation') setStep('pending_activation');
      else authError(null);
    } catch (err) {
      authError(err);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'totp_setup')
    return (
      <AuthLayout title="Set up two-step sign-in" subtitle="Required for every admin.">
        <TotpSetupStep onDone={done} onRestart={restart} />
      </AuthLayout>
    );
  if (step === 'pending_activation')
    return (
      <AuthLayout title="Account created" footer={<Link to="/login" className="font-semibold text-primary">Back to sign in</Link>}>
        <div className="flex gap-3 text-sm text-text-secondary">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <p>Your account was created. An admin has to activate it before you can sign in. You'll set up two-step sign-in the first time you log in.</p>
        </div>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="Create your admin account"
      subtitle={inviteToken ? 'Use the email your invitation was sent to.' : 'You need an invitation to sign up.'}
      footer={
        <>
          Already have an account? <Link to="/login" className="font-semibold text-primary">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Email" type="email" autoComplete="username" required autoFocus value={f.email} onChange={set('email')} disabled={needKey} />
        <Field label="Password" type="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={set('password')} />
        <Field label="Confirm password" type="password" autoComplete="new-password" required value={f.confirm} onChange={set('confirm')} />
        {mismatch && <p className="-mt-2 mb-3 text-xs text-destructive">The passwords don't match.</p>}
        {needKey && <Field label="Super admin key" type="password" autoComplete="off" required autoFocus value={f.superKey} onChange={set('superKey')} />}
        <button type="submit" className="btn-primary mt-2 h-10 w-full" disabled={busy || mismatch}>
          {busy && <Spinner className="text-white" />} {needKey ? 'Create super admin' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
