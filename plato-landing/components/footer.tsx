import Link from "next/link";
import { Logo } from "./nav";
import { APP, CONTACT, LOGIN, PRIVACY, TERMS } from "./links";

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Link className="brand" href="/"><Logo />Plato</Link>
            <p>Plato for employers is on its way. For job seekers, Plato searches, ranks and applies at jobs.platohiring.com.</p>
          </div>
                    <div><h4>Trust</h4><Link href="/security/">Rules and data</Link><Link href={PRIVACY}>Privacy policy</Link><Link href={TERMS}>Terms of service</Link></div>
          <div><h4>Job seekers</h4><a href={APP}>Find a job with Plato</a><a href={LOGIN}>Log in</a><span style={{ display: "block", padding: "4px 0" }}>{CONTACT}</span></div>
        </div>
        <div className="foot-bottom"><span>© 2026 Plato · platohiring.com</span><span>Made for job seekers who&apos;d rather interview than fill forms.</span></div>
      </div>
    </footer>
  );
}
