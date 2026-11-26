// Every country by ISO code with its English name, and the reverse ("Dubai, UAE" -> AE). New search and onboarding share it.
const REGION = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "none",
})
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
export const ALL_COUNTRIES = [...A]
  .flatMap((a) => [...A].map((b) => a + b))
  .flatMap((c) => (REGION.of(c) ? [{ code: c, name: c === "AE" ? "UAE" : REGION.of(c)! }] : []))
  .sort((x, y) => x.name.localeCompare(y.name))
export const nameOf = (code: string) => ALL_COUNTRIES.find((c) => c.code === code)?.name ?? code
export const codeOf = (text: string | null | undefined) => {
  const t = (text ?? "").trim().toLowerCase()
  if (!t) return null
  const alias: Record<string, string> = {
    uae: "AE",
    emirates: "AE",
    "united arab emirates": "AE",
    ksa: "SA",
    saudi: "SA",
    uk: "GB",
    britain: "GB",
    england: "GB",
    usa: "US",
    us: "US",
    america: "US",
  }
  if (alias[t]) return alias[t]
  const last = t.split(",").at(-1)!.trim()
  return ALL_COUNTRIES.find((c) => [t, last].includes(c.name.toLowerCase()) || c.code.toLowerCase() === t)?.code ?? null
}
