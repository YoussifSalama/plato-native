"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Pinned stacking cards: each card is position: sticky with a slightly lower top than the last, so on scroll it
// pins and the next one slides over it. As a card gets covered it scales down and dims (--s, --b), which is the
// only part that needs script; without it (or with reduced motion) the cards still pin and stack.
export function Stack({ head, children }: { head: ReactNode; children: ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = [...root.querySelectorAll<HTMLElement>(".scard")];
    let raf = 0;
    const paint = () => {
      raf = 0;
      cards.forEach((c, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const top = c.getBoundingClientRect().top;
        const nTop = next.getBoundingClientRect().top;
        const h = c.offsetHeight || 1;
        const covered = Math.min(1, Math.max(0, 1 - (nTop - top) / h)); // 0 when the next card is a card-height away, 1 when on top
        c.style.setProperty("--s", String(1 - covered * 0.06 * (cards.length - i - 1 > 0 ? 1 : 0)));
        c.style.setProperty("--b", String(1 - covered * 0.35));
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="stack" ref={ref}>
      <div className="stack-head">{head}</div>
      {children}
    </div>
  );
}

export function SCard({ i, step, title, text, tags, children }: { i: number; step: string; title: string; text: string; tags?: string[]; children: ReactNode }) {
  return (
    <article className="scard" style={{ ["--i" as string]: i } as React.CSSProperties}>
      <div>
        <span className="step">{step}</span>
        <h3>{title}</h3>
        <p>{text}</p>
        {tags && <div className="tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>}
      </div>
      <div className="stage">{children}</div>
    </article>
  );
}
