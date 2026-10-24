import { cn } from "cn"

import type { JobSourceName } from "@/lib/jobs/api"

type Source = JobSourceName | "BOARDS"

// Letter tiles: brand colour, glyph, accessible name. New boards add a row.
const LETTER_TILES: Partial<Record<Source, { bg: string; glyph: string; label: string }>> = {
  GREENHOUSE: { bg: "bg-[#24A47F]", glyph: "g", label: "Greenhouse" },
  ASHBY: { bg: "bg-[#5A45E5]", glyph: "A", label: "Ashby" },
  INDEED: { bg: "bg-[#2557A7]", glyph: "i", label: "Indeed" },
  GOOGLE_JOBS: { bg: "bg-[#4285F4]", glyph: "G", label: "Google Jobs" },
  ZIPRECRUITER: { bg: "bg-[#2C8C3E]", glyph: "Z", label: "ZipRecruiter" },
  GLASSDOOR: { bg: "bg-[#0CAA41]", glyph: "g", label: "Glassdoor" },
  TALENT: { bg: "bg-[#F26A21]", glyph: "T", label: "Talent.com" },
  JOBBANK: { bg: "bg-[#26374A]", glyph: "J", label: "Job Bank" },
  JOBILLICO: { bg: "bg-[#D5232A]", glyph: "J", label: "Jobillico" },
  DICE: { bg: "bg-[#EB1C26]", glyph: "D", label: "Dice" },
  HANDSHAKE: { bg: "bg-[#5B21B6]", glyph: "H", label: "Handshake" },
  BUILTIN: { bg: "bg-[#2E5BFF]", glyph: "B", label: "Built In" },
  WUZZUF: { bg: "bg-[#0B5FFF]", glyph: "W", label: "Wuzzuf" },
  REMOTIVE: { bg: "bg-[#FF4F5E]", glyph: "R", label: "Remotive" },
  JOBICY: { bg: "bg-[#00A3A3]", glyph: "J", label: "Jobicy" },
  REMOTEOK: { bg: "bg-[#F23F37]", glyph: "R", label: "Remote OK" },
  HIMALAYAS: { bg: "bg-[#1E8E5A]", glyph: "H", label: "Himalayas" },
  JOOBLE: { bg: "bg-[#2D6BFF]", glyph: "J", label: "Jooble" },
  ADZUNA: { bg: "bg-[#0F6FDE]", glyph: "A", label: "Adzuna" },
  BAYT: { bg: "bg-[#0A66C2]", glyph: "B", label: "Bayt" },
  NAUKRIGULF: { bg: "bg-[#2457C5]", glyph: "N", label: "Naukrigulf" },
  GULFTALENT: { bg: "bg-[#C8102E]", glyph: "G", label: "GulfTalent" },
  WEWORKREMOTELY: { bg: "bg-[#2B2B2B]", glyph: "W", label: "We Work Remotely" },
  WORKINGNOMADS: { bg: "bg-[#F59E0B]", glyph: "N", label: "Working Nomads" },
  WELLFOUND: { bg: "bg-[#111827]", glyph: "W", label: "Wellfound" },
  ARC: { bg: "bg-[#6D28D9]", glyph: "A", label: "Arc" },
  DYNAMITEJOBS: { bg: "bg-[#E11D48]", glyph: "D", label: "Dynamite Jobs" },
  JOBGETHER: { bg: "bg-[#0D9488]", glyph: "J", label: "Jobgether" },
  NODESK: { bg: "bg-[#374151]", glyph: "N", label: "NoDesk" },
  BOARDS: { bg: "bg-primary", glyph: "B", label: "Job boards" },
}

// Job-board marks drawn inline (no external assets): LinkedIn "in",
// Workable "W", Lever "L"; everything else is a letter tile on its brand colour.
function SourceTile({ source, size = 44, className }: { source: Source; size?: number; className?: string }) {
  const radius = Math.max(6, Math.round(size * 0.24))
  const common = { width: size, height: size, borderRadius: radius }
  if (source === "LINKEDIN")
    return (
      <span className={cn("flex shrink-0 items-center justify-center bg-[#0A66C2] text-white", className)} style={common} aria-label="LinkedIn" role="img">
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor" aria-hidden>
          <path d="M6.94 8.5V19H3.56V8.5h3.38zM5.25 3.5a1.96 1.96 0 1 1 0 3.92 1.96 1.96 0 0 1 0-3.92zM20.44 19h-3.37v-5.1c0-1.22-.02-2.78-1.7-2.78-1.7 0-1.96 1.33-1.96 2.69V19h-3.37V8.5h3.24v1.43h.05c.45-.85 1.55-1.75 3.19-1.75 3.41 0 4.04 2.25 4.04 5.17V19z" />
        </svg>
      </span>
    )
  if (source === "WORKABLE")
    return (
      <span className={cn("flex shrink-0 items-center justify-center bg-[#00B29E] text-white", className)} style={common} aria-label="Workable" role="img">
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6l3.5 12L12 8l5.5 10L21 6" />
        </svg>
      </span>
    )
  const letter = LETTER_TILES[source]
  if (letter)
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center font-bold text-white", letter.bg, className)}
        style={{ ...common, fontSize: Math.round(size * 0.5) }}
        aria-label={letter.label}
        role="img"
      >
        {letter.glyph}
      </span>
    )
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-[#1B1B3A] text-white", className)} style={common} aria-label="Lever" role="img">
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 4v16h10" />
      </svg>
    </span>
  )
}

export { SourceTile }
