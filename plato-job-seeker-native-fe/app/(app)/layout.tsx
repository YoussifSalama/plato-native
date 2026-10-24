import type { ReactNode } from "react"
import { AppShell } from "@/components/app-shell"
import { GlobalAssistant } from "@/components/global-assistant"
import { AgentCursor } from "@/components/agent-cursor"
import { CommandPalette } from "@/components/command-palette"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      {children}
      <GlobalAssistant />
      <CommandPalette />
      <AgentCursor />
    </AppShell>
  )
}
