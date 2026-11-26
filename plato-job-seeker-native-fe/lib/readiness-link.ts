// "Complete my details": the onboarding screen that holds the first missing detail, scrolled to it (?focus).
export const detailsHref = (missing: { key: string }[], back: string) => {
  const first = missing[0]?.key
  return first === "resume" ? `/onboarding?step=1&return=${back}` : `/onboarding?step=2&return=${back}${first ? `&focus=${first}` : ""}`
}
