"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOGIN, NAV, SIGNUP } from "./links";

export function Logo({ size = 32 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="" width={size} height={size} style={{ width: size, height: size }} />;
}

// The floating pill nav (NestJS pattern): sticky, over the hero card, blurred glass.
export function Nav() {
  const path = usePathname();
  return (
    <div className="nav-shell" style={{ marginTop: 30 }}>
      <nav className="nav" aria-label="Main">
        <Link className="brand" href="/" aria-label="Plato home"><Logo />Plato</Link>
        <div className="nav-links">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>{n.label}</Link>)}
        </div>
        <div className="nav-right">
          <a className="login" href={LOGIN}>Log in</a>
          <a className="btn white sm" href={SIGNUP}>Start free</a>
          <details className="menu">
            <summary aria-label="Menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg></summary>
            <div className="sheet">{NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}<a href={LOGIN}>Log in</a></div>
          </details>
        </div>
      </nav>
    </div>
  );
}
