import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { Me, TotpSetup } from '../../lib/types';
import { Spinner } from '../../components/ui';
import { authError } from './authError';

/** The 6-digit code field + verify. Used after login (step totp) and after the QR setup. */
export function TotpCode({ onDone, onRestart }: { onDone: (me: Me) => void; onRestart: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await api<Me>('/admin/auth/totp/verify', { body: { code } }));
    } catch (err) {
      authError(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <label className="mb-3 block">
        <span className="label">6-digit code from your authenticator app</span>
        <input
          className="input h-12 text-center text-xl font-semibold tracking-[0.5em] tabular-nums"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </label>
      <button type="submit" className="btn-primary h-10 w-full" disabled={busy || code.length !== 6}>
        {busy && <Spinner className="text-white" />} Verify
      </button>
      <button type="button" className="btn-ghost mt-2 w-full" onClick={onRestart}>
        Start over
      </button>
    </form>
  );
}

/** First sign-in (or after a 2FA reset): scan the QR, then confirm with a code. */
export function TotpSetupStep({ onDone, onRestart }: { onDone: (me: Me) => void; onRestart: () => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    let live = true;
    api<TotpSetup>('/admin/auth/totp/setup')
      .then(async (s) => {
        if (!live) return;
        setSetup(s);
        setQr(await QRCode.toDataURL(s.otpauthUrl, { width: 200, margin: 1, color: { dark: '#0e1b2c', light: '#ffffff' } }));
      })
      .catch((e) => {
        authError(e);
        onRestart();
      });
    return () => {
      live = false;
    };
  }, [onRestart]);

  if (!setup)
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-6" />
      </div>
    );
  return (
    <div>
      <ol className="mb-4 list-decimal space-y-1 pl-4 text-sm text-text-secondary">
        <li>Open an authenticator app (Google Authenticator, 1Password, Authy…).</li>
        <li>Scan this code, or type the key below.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      <div className="mb-4 flex justify-center">
        {qr ? <img src={qr} alt="Authenticator QR code" className="size-[200px] rounded-lg border border-border" /> : <Spinner />}
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
        <code className="min-w-0 flex-1 font-mono text-xs break-all">{setup.secret}</code>
        <button
          type="button"
          className="btn-ghost h-8 px-2"
          aria-label="Copy key"
          onClick={() => void navigator.clipboard?.writeText(setup.secret).then(() => toast.success('Key copied'))}
        >
          <Copy className="size-4" />
        </button>
      </div>
      <TotpCode onDone={onDone} onRestart={onRestart} />
    </div>
  );
}
