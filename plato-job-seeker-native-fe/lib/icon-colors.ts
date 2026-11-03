export const ICON_COLORS = {
  brand: "bg-primary-soft text-primary",
  sky: "bg-sky-100 text-sky-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  rose: "bg-rose-100 text-rose-600",
  cyan: "bg-cyan-100 text-cyan-700",
  teal: "bg-teal-100 text-teal-600",
  orange: "bg-orange-100 text-orange-600",
} as const

export type IconColor = keyof typeof ICON_COLORS

const COLOR_KEYS = Object.keys(ICON_COLORS) as IconColor[]

// Shuffles colors across a list of items with no two adjacent items sharing
// a color, so a static list still reads as "randomly distributed" rather
// than accidentally repeating the same color twice in a row.
export function distributeColors(count: number): IconColor[] {
  const pool = [...COLOR_KEYS].sort(() => Math.random() - 0.5)
  const result: IconColor[] = []
  for (let i = 0; i < count; i++) {
    let color = pool[i % pool.length]
    if (color === result[i - 1]) {
      color = pool[(i + 1) % pool.length]
    }
    result.push(color)
  }
  return result
}
