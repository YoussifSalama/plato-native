"use client"

import { useEffect } from "react"
import { startPairing } from "@/lib/extension/api"

// The Plato Apply extension id this page may talk to. The unpacked build pins the Web Store key, so both
// builds share it (NEXT_PUBLIC_EXTENSION_IDS overrides, comma-separated).
const IDS = (process.env.NEXT_PUBLIC_EXTENSION_IDS || "khlefnjhigieijnbjhgfedpmenobcope")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

type Reply = { installed: true; linked: boolean } | undefined
type ChromeRuntime = { sendMessage: (id: string, msg: unknown, cb: (r: Reply) => void) => void; lastError?: unknown }

const ask = (rt: ChromeRuntime, id: string, msg: unknown) =>
  new Promise<Reply>((resolve) => {
    try {
      rt.sendMessage(id, msg, (r) => {
        void rt.lastError // read it, so Chrome doesn't log "unchecked runtime.lastError" when not installed
        resolve(r)
      })
    } catch {
      resolve(undefined)
    }
  })

// Send one message to the installed Plato extension, whichever build id answers. undefined = not installed here.
export async function askExtension(msg: unknown): Promise<Reply> {
  const rt = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime
  if (!rt?.sendMessage) return undefined
  for (const id of IDS) {
    const r = await ask(rt, id, msg)
    if (r?.installed) return r
  }
  return undefined
}

// Logged in here + Plato Apply installed but not linked: link it now, no code to copy.
// The page makes a one-time pairing code with this session and hands it to the extension,
// which does the usual exchange. The login itself never leaves the page.
export function ExtensionAutoLink() {
  useEffect(() => {
    const rt = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime
    if (!rt?.sendMessage) return // no extension allows this site to message it
    let cancelled = false
    void (async () => {
      for (const id of IDS) {
        const status = await ask(rt, id, { type: "plato:status" })
        if (cancelled || !status?.installed) continue
        if (status.linked) return
        const pairing = await startPairing().catch(() => null)
        if (!pairing || cancelled) return
        const done = await ask(rt, id, { type: "plato:pair", code: pairing.code })
        if (done?.linked) window.dispatchEvent(new Event("plato:extension-linked"))
        return
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return null
}
