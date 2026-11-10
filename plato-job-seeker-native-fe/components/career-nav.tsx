"use client"

import { usePathname, useRouter } from "next/navigation"
import { BookOpen, ClipboardCheck, Gauge, Lightbulb, Mic, Trophy, UserRound } from "lucide-react"
import { PillTabs } from "@/components/pill-tabs"

// One navigation for every Career page, so each part of Career is one click from the others.
const TABS = [
  { key: "/career", label: "Overview", icon: Gauge },
  { key: "/career/assessments", label: "Assessments", icon: ClipboardCheck },
  { key: "/career/interviews", label: "Interviews", icon: Mic },
  { key: "/career/proof", label: "Proof of skills", icon: Trophy },
  { key: "/career/skills", label: "Skills gap", icon: Lightbulb },
  { key: "/career/snapshot", label: "Snapshot", icon: UserRound },
  { key: "/career/library", label: "Practice library", icon: BookOpen },
] as const

export function CareerNav({ active: forced }: { active?: string } = {}) {
  const path = usePathname()
  const router = useRouter()
  // The longest matching prefix wins: /career/interviews/simulate → Interviews; /career → Overview.
  const active = forced ?? [...TABS].sort((a, b) => b.key.length - a.key.length).find((t) => path === t.key || path.startsWith(`${t.key}/`))?.key ?? "/career"
  return <PillTabs id="career-nav" label="Career" dataAi="career.nav" tabs={TABS.map((t) => ({ ...t }))} value={active} onChange={(k) => router.push(k)} />
}
