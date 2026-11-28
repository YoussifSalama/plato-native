import { useEffect, type ReactNode } from 'react';

// The seeker app's brand panel (lib/brand.ts BRAND_PANEL, Home's header): a white card washed with
// cobalt from the top left and azure from the bottom right.
export const BRAND_PANEL =
  'border border-border/80 bg-card bg-[radial-gradient(120%_70%_at_0%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_60%),radial-gradient(90%_60%_at_100%_100%,color-mix(in_oklch,var(--azure)_9%,transparent),transparent_65%)]';
// Chips and secondary controls sitting on the brand panel.
export const BRAND_GLASS = 'border border-primary-line/70 bg-card/85 backdrop-blur-sm';

export const greeting = (h = new Date().getHours()) =>
  h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

/** "Saturday, 28 November". */
export const today = (d = new Date()) =>
  `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;

/**
 * Every page's header, as the seeker Home draws it: a small eyebrow, the title, a line under it
 * (plain text, or a status pill with a live dot), and the page's actions in the usual top-right spot.
 * Its two background layers drift with the pointer at their own rates (.fx-depth, written by CardFx);
 * still with reduced motion or on touch.
 */
export function BrandHeader({
  eyebrow,
  title,
  description,
  status,
  live,
  actions,
  docTitle,
}: {
  /** The browser tab's title when `title` is not plain text ("Rate limits"). */
  docTitle?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  live?: boolean;
  actions?: ReactNode;
}) {
  // each page names its browser tab ("Users · Plato Admin"), so several open tabs can be told apart
  const name = docTitle ?? (typeof title === 'string' ? title : undefined);
  const crumb = typeof eyebrow === 'string' && !/\d/.test(eyebrow) ? eyebrow : undefined;
  useEffect(() => {
    if (!name) return;
    document.title = [name, crumb && crumb !== name ? crumb : null, 'Plato Admin'].filter(Boolean).join(' · ');
  }, [name, crumb]);
  return (
    <section className={`${BRAND_PANEL} fx-depth enter relative isolate mb-5 overflow-hidden rounded-[28px] px-5 py-6 shadow-card sm:px-8 sm:py-7`}>
      <span
        aria-hidden
        className="depth-2 pointer-events-none absolute -top-24 -right-24 -z-10 size-[420px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--azure)_16%,transparent),transparent_65%)]"
      />
      <span
        aria-hidden
        className="depth-1 pointer-events-none absolute -inset-6 -z-10 [background-image:radial-gradient(var(--primary)_1px,transparent_1px)] [background-size:22px_22px] opacity-[0.05]"
      />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-[12px] font-bold tracking-[0.22em] text-text-tertiary uppercase">{eyebrow}</p>}
          <h1 className={`${eyebrow ? 'mt-2' : ''} text-[26px] leading-tight font-extrabold tracking-tight break-words sm:text-[32px]`}>{title}</h1>
          {description && <div className="mt-2 text-sm text-text-secondary">{description}</div>}
          {status && (
            // wraps on a phone instead of cutting the numbers off; one line from sm up
            <p className={`${BRAND_GLASS} mt-3 inline-flex max-w-full items-center gap-2.5 rounded-2xl py-1.5 pr-4 pl-2.5 text-sm sm:rounded-full`}>
              <span className="relative flex size-2.5 shrink-0">
                {live && <span className="ping absolute inline-flex size-full rounded-full bg-success opacity-70" />}
                <span className={`relative inline-flex size-2.5 rounded-full ${live ? 'bg-success' : 'bg-text-tertiary'}`} />
              </span>
              <span className="min-w-0 sm:truncate">{status}</span>
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
      </div>
    </section>
  );
}
