import type { Transition, Variants } from "motion/react"

// One motion vocabulary for the inner product. Primary events use springs,
// secondary use eased tweens, micro events stay near-instant.
export const spring = {
  enter: { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } satisfies Transition,
  settle: { type: "spring", stiffness: 180, damping: 24 } satisfies Transition,
  micro: { type: "spring", stiffness: 500, damping: 30 } satisfies Transition,
}

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
}

export const duration = {
  reveal: 0.35,
  connection: 0.55,
  pulse: 1.4,
  stagger: 0.09,
  typeMs: 16,
}

// Primary: a node entering the spatial canvas (depth + lift).
export const nodeEnter: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.96, rotateX: 6, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    filter: "blur(0px)",
    transition: { ...spring.enter, filter: { duration: duration.reveal } },
  },
}

// Secondary: internal hierarchy of a node revealed top-down.
export const nodeContent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: duration.stagger, delayChildren: 0.12 } },
}

export const lineReveal: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: duration.reveal, ease: ease.out } },
}

export const clipReveal: Variants = {
  hidden: { clipPath: "inset(0 100% 0 0)", opacity: 0.6 },
  show: { clipPath: "inset(0 0% 0 0)", opacity: 1, transition: { duration: 0.45, ease: ease.out } },
}

export const reducedVariants = (v: Variants): Variants => ({
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  ...(v === nodeContent ? { show: { transition: { staggerChildren: 0 } } } : {}),
})
