import { APP } from "@/components/links";
import { Beams } from "@/components/sections";

// platohiring.com while the company site is being built: the job-seeker product moved to jobs.platohiring.com (its
// landing is the app's front page), and Plato for employers comes here later.
export default function Home() {
  return (
    <main>
      <header className="hero" id="top">
        <Beams />
        <div className="hero-center">
          <span className="badge"><b>Soon</b>Plato for employers</span>
          <h1>Hiring, <span className="grad">done in the open</span>.</h1>
          <p className="sub">We&apos;re building Plato for employers. Looking for a job? Plato already searches, ranks and applies for you.</p>
          <div className="cta"><a className="btn white lg" href={APP}>Find a job with Plato</a></div>
        </div>
      </header>
    </main>
  );
}
