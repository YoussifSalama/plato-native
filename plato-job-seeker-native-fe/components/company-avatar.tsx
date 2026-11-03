"use client"

import { useState } from "react"
import { cn } from "cn"

// Warm, readable background per company (same name, same colour).
const TONES = ["bg-[#005BA7]", "bg-[#0B5FFF]", "bg-[#0E9F6E]", "bg-[#D97706]", "bg-[#DB2777]", "bg-[#0891B2]", "bg-[#C2410C]", "bg-[#475569]"]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")

// The employer's mark: its logo when we know its own website, otherwise initials.
// (The domain is never a job board's, so a logo can't be LinkedIn's by mistake.)
// ponytail: logos come from the public favicon service, so the browser asks it for that domain; self-host or proxy later if that matters.
function CompanyAvatar({ name, domain, size = 44, className }: { name: string; domain?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const radius = Math.max(6, Math.round(size * 0.24))
  const style = { width: size, height: size, borderRadius: radius }
  if (domain && !failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`} alt={`${name} logo`} width={size} height={size} loading="lazy" onError={() => setFailed(true)} className={cn("shrink-0 border bg-white object-contain p-1.5", className)} style={style} />
    )
  return (
    <span className={cn("flex shrink-0 items-center justify-center font-bold text-white", TONES[hash(name.toLowerCase()) % TONES.length], className)} style={{ ...style, fontSize: Math.round(size * 0.38) }} role="img" aria-label={name}>
      {initials(name) || "?"}
    </span>
  )
}

export { CompanyAvatar }
