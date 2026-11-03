import Link from "next/link";
import { Logo } from "./nav";
import { CONTACT, LOGIN, PRIVACY, SIGNUP, TERMS } from "./links";

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Link className="brand" href="/"><Logo />Plato</Link>
            <p>The AI job hunter that searches, ranks and applies, in the open. You step in only when it needs you.</p>
          </div>
          <div><h4>Product</h4><Link href="/features/">Features</Link><Link href="/extension/">Chrome extension</Link><Link href="/how-it-works/">How it works</Link><Link href="/pricing/">Pricing</Link></div>
          <div><h4>Trust</h4><Link href="/security/">Rules and data</Link><Link href={PRIVACY}>Privacy policy</Link><Link href={TERMS}>Terms of service</Link></div>
          <div><h4>Account</h4><a href={SIGNUP}>Create account</a><a href={LOGIN}>Log in</a><span style={{ display: "block", padding: "4px 0" }}>{CONTACT}</span></div>
        </div>
        <div className="foot-bottom"><span>© 2026 Plato · platohiring.com</span><span>Made for job seekers who&apos;d rather interview than fill forms.</span></div>
      </div>
    </footer>
  );
}
