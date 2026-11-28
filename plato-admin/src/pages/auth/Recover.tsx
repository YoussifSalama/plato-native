import { useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { Ok } from '../../lib/types';
import { Spinner } from '../../components/ui';
import { AuthLayout, Field } from './AuthLayout';
import { authError } from './authError';

/** Super admin lost the authenticator (or the password): the super key resets 2FA. */
export default function Recover() {
  const [f, setF] = useState({ email: '', superKey: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api<Ok>('/admin/auth/super-reset', { body: { email: f.email, superKey: f.superKey, newPassword: f.newPassword || undefined } });
      setOk(true);
    } catch (err) {
      authError(err);
    } finally {
      setBusy(false);
    }
  };

  if (ok)
    return (
      <AuthLayout title="Reset done" footer={<Link to="/login" className="font-semibold text-primary">Go to sign in</Link>}>
        <div className="flex gap-3 text-sm text-text-secondary">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <p>Two-step sign-in was cleared{f.newPassword ? ' and the password changed' : ''}. Sign in to scan a new QR code.</p>
        </div>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="Super admin recovery"
      subtitle="Clears the super admin's two-step sign-in. Optionally sets a new password."
      footer={<Link to="/login" className="font-semibold text-primary">Back to sign in</Link>}
    >
      <form onSubmit={submit}>
        <Field label="Super admin email" type="email" autoComplete="username" required autoFocus value={f.email} onChange={set('email')} />
        <Field label="Super admin key" type="password" autoComplete="off" required value={f.superKey} onChange={set('superKey')} />
        <Field label="New password (optional)" type="password" autoComplete="new-password" minLength={8} value={f.newPassword} onChange={set('newPassword')} />
        <button type="submit" className="btn-primary mt-2 h-10 w-full" disabled={busy}>
          {busy && <Spinner className="text-white" />} Reset
        </button>
      </form>
    </AuthLayout>
  );
}
