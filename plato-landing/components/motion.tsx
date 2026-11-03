"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Scroll-in motion for the whole site without touching the markup: everything matching SELECTORS gets the
// `reveal` class and fades up when it enters the viewport, staggered among its siblings. Re-run on every
// route change (static export, client navigation). Honors prefers-reduced-motion via the CSS.
const SELECTORS = [".eyebrow", ".h2", ".lead", ".tile", ".feature > *", ".plan", ".pack", ".rules > div", ".faq details", ".steps4 > div", ".src-row", ".closing > *", ".legal section", ".page-head > *", ".cta", ".chips"].join(",");

export function Motion() {
  const path = usePathname();
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(SELECTORS)].filter((e) => !e.closest(".hero:not(.short) .hero-center") && !e.closest(".scard"));
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((el) => {
      if (el.classList.contains("in")) return;
      // the effect can run more than once (hydration, route change); marking is idempotent, observing is redone
      if (!el.classList.contains("reveal")) {
        const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => c.classList.contains("reveal") || c === el) : [el];
        el.style.setProperty("--d", `${Math.min(sibs.indexOf(el), 8) * 70}ms`);
        el.classList.add("reveal");
      }
      // already on screen (above the fold on load): show right away, no observer wait
      if (el.getBoundingClientRect().top < innerHeight) requestAnimationFrame(() => el.classList.add("in")); else io.observe(el);
    });
    return () => io.disconnect();
  }, [path]);
  return null;
}
