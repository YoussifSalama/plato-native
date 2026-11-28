import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Plato Admin`;
  }, [title]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(60rem_30rem_at_50%_-10%,var(--primary-soft),transparent)] px-4 py-10">
      <Link to="/login" className="enter mb-6 flex items-center gap-2.5">
        <img src="/logo.png" alt="" className="size-10 rounded-xl bg-white shadow-card ring-1 ring-primary-line/70" />
        <span className="flex flex-col leading-none">
          <span className="text-base font-extrabold tracking-[0.22em] text-primary">PLATO</span>
          <span className="mt-1 text-[10px] font-bold tracking-[0.3em] text-text-secondary">ADMIN</span>
        </span>
      </Link>
      <div className="card enter w-full max-w-sm [animation-delay:80ms]">
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center text-sm text-text-secondary">{footer}</div>}
    </div>
  );
}

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-3 block">
      <span className="label">{label}</span>
      <input className="input h-10" {...props} />
    </label>
  );
}
