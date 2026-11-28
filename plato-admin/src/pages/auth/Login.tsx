import { useCallback, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { AuthNext, Me } from '../../lib/types';
import { Spinner } from '../../components/ui';
import { AuthLayout, Field } from './AuthLayout';
import { authError } from './authError';
import { TotpCode, TotpSetupStep } from './Totp';

type Step = 'password' | 'totp' | 'totp_setup';

export default function Login() {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const restart = useCallback(() => setStep('password'), []);
  const done = useCallback(
    (m: Me) => {
      setMe(m);
      nav(from, { replace: true });
    },
    [setMe, nav, from],
  );

  if (me) return <Navigate to={from} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<AuthNext>('/admin/auth/login', { body: { email, password } });
      if (r.next === 'totp' || r.next === 'totp_setup') {
        setStep(r.next);
        setPassword('');
      } else authError(null);
    } catch (err) {
      authError(err);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'totp')
    return (
      <AuthLayout title="Two-step check" subtitle={email}>
        <TotpCode onDone={done} onRestart={restart} />
      </AuthLayout>
    );
  if (step === 'totp_setup')
    return (
      <AuthLayout title="Set up two-step sign-in" subtitle="Required for every admin.">
        <TotpSetupStep onDone={done} onRestart={restart} />
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Plato admin panel"
      footer={
        <>
          Invited? <Link to="/signup" className="font-semibold text-primary">Create your account</Link>
          <span className="mx-2 text-text-tertiary">·</span>
          <Link to="/recover" className="font-semibold text-primary">Super admin recovery</Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="btn-primary mt-2 h-10 w-full" disabled={busy}>
          {busy && <Spinner className="text-white" />} Continue
        </button>
      </form>
    </AuthLayout>
  );
}
