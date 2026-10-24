import { cursorTo } from "@/components/agent-cursor"
import type { OrchestratorEvent } from "@/lib/jobs/api"

// What the assistant "sees": headings, visible text and every control on the page,
// each control tagged with an id it can click or type into. Read from the live DOM
// on every message, so it is always what the person is looking at.

export type MapElement = { id: string; kind: "link" | "button" | "tab" | "input" | "select" | "checkbox"; label: string; href?: string; value?: string; on?: boolean }
export type PageMap = { url: string; title?: string; headings?: string[]; text?: string; elements: MapElement[] }

// Never offered to the assistant, never clicked by it.
const OFF_LIMITS = /log ?out|sign ?out|delete|remove account|deactivate|unsubscribe/i
const SKIP = "[data-ai-skip],script,style"
const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
}
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim()

function labelOf(el: HTMLElement) {
  const input = el as HTMLInputElement
  return clean(el.getAttribute("aria-label") || input.labels?.[0]?.textContent || el.getAttribute("placeholder") || el.innerText || el.getAttribute("title") || input.name).slice(0, 100)
}

export function buildPageMap(): PageMap {
  document.querySelectorAll("[data-ai-id]").forEach((el) => el.removeAttribute("data-ai-id"))
  const found: (MapElement & { el: HTMLElement; top: number })[] = []
  document.querySelectorAll<HTMLElement>("a[href],button,[role=tab],input,textarea,select,[role=checkbox],[role=switch]").forEach((el) => {
    if (el.closest(SKIP) || (el as HTMLButtonElement).disabled || !isVisible(el)) return
    const tag = el.tagName
    const type = (el as HTMLInputElement).type
    if (tag === "INPUT" && ["password", "file", "hidden"].includes(type)) return
    const label = labelOf(el)
    if (!label || OFF_LIMITS.test(label)) return
    const top = el.getBoundingClientRect().top
    const base = { el, top, label }
    if (tag === "A") found.push({ ...base, id: "", kind: "link", href: (el.getAttribute("href") ?? "").slice(0, 160) })
    else if (el.getAttribute("role") === "tab") found.push({ ...base, id: "", kind: "tab", on: el.getAttribute("aria-selected") === "true" })
    else if (tag === "SELECT") found.push({ ...base, id: "", kind: "select", value: (el as HTMLSelectElement).value.slice(0, 60) })
    else if (type === "checkbox" || type === "radio" || el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "switch") found.push({ ...base, id: "", kind: "checkbox", on: (el as HTMLInputElement).checked ?? el.getAttribute("aria-checked") === "true" })
    else if (tag === "INPUT" || tag === "TEXTAREA") found.push({ ...base, id: "", kind: "input", value: (el as HTMLInputElement).value.slice(0, 60) })
    else found.push({ ...base, id: "", kind: "button" })
  })
  // What is on screen now comes first, so the cap drops the far-off controls.
  const vh = window.innerHeight
  const inView = (t: number) => (t >= -20 && t <= vh ? 0 : 1)
  found.sort((a, b) => inView(a.top) - inView(b.top))
  // Controls the code names (data-ai, or a fixed DOM id) keep that name; the rest get e1, e2...
  const elements = found.slice(0, 90).map(({ el, ...e }, i) => {
    const id = el.dataset.ai || (/^[a-z][\w-]{1,30}$/i.test(el.id) && !/^radix/i.test(el.id) ? el.id : `e${i + 1}`)
    el.setAttribute("data-ai-id", id)
    return { id, kind: e.kind, label: e.label, href: e.href, value: e.value, on: e.on }
  })

  const headings = [...document.querySelectorAll<HTMLElement>("h1,h2,h3")].filter((h) => !h.closest(SKIP) && isVisible(h)).map((h) => clean(h.innerText).slice(0, 120)).filter(Boolean).slice(0, 15)
  // Visible text of the page itself, not the sidebar or the assistant panel.
  let text = ""
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n && text.length < 1800; n = walker.nextNode()) {
    const p = n.parentElement
    const t = clean(n.textContent)
    if (!p || !t || p.closest(`${SKIP},aside,nav`) || !isVisible(p) || p.getBoundingClientRect().top > vh * 2) continue
    text += `${t} `
  }
  return { url: location.pathname + location.search, title: document.title || undefined, headings, text: text.slice(0, 1800), elements: elements as MapElement[] }
}

// A named control works even if it was not in the last map (e.g. found through describe_page).
const byId = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-ai-id="${CSS.escape(id)}"],[data-ai="${CSS.escape(id)}"]`)].find(isVisible) ?? null

// Does what the assistant asked: glide the cursor to the control, then click or type.
// Returns a sentence for the chat when it could not be done, so nothing fails silently.
export async function runPageEvent(e: OrchestratorEvent, push: (path: string) => void): Promise<string | null> {
  if (e.type === "goto") {
    if (location.pathname === e.path) return null
    const link = () => [...document.querySelectorAll<HTMLAnchorElement>(`a[href="${CSS.escape(e.path)}"]`)].find((a) => !a.closest("[data-ai-skip]") && isVisible(a))
    // Like a person: if the link is not on this page, go through the sidebar section first
    // (Jobs for /jobs/<id>), then find the row on that page, scroll to it and click it.
    if (!link()) {
      const section = "/" + e.path.split("/")[1]
      const nav = [...document.querySelectorAll<HTMLElement>(`nav a[href="${CSS.escape(section)}"]`)].find(isVisible)
      if (nav && location.pathname !== section) {
        await cursorTo(nav, `Opening ${labelOf(nav)}`.slice(0, 30), 0)
        nav.click()
        for (let i = 0; i < 25 && !link(); i++) await new Promise((r) => setTimeout(r, 120))
      }
    }
    const row = link()
    if (row) {
      await cursorTo(row, labelOf(row).slice(0, 30) || "Opening")
      row.click()
    } else push(e.path)
    return null
  }
  if (e.type !== "click" && e.type !== "type_text") return null
  const el = byId(e.elementId)
  if (!el) return "I could not find that control on the page any more. Ask me again."
  if (OFF_LIMITS.test(labelOf(el))) return "I will not press that one."
  await cursorTo(el, e.type === "click" ? labelOf(el).slice(0, 30) : "Typing")
  if (e.type === "click") {
    el.click()
    return null
  }
  {
    const input = el as HTMLInputElement | HTMLTextAreaElement
    if (!("value" in input) || (input as HTMLInputElement).type === "password") return "I cannot type into that field."
    el.focus()
    // React tracks the value itself; the native setter makes it see the change.
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, e.text)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    return null
  }
}

// After a step that changes the page, the assistant gets the new page and carries on.
export const CONTINUE_TEXT = "Continue: the page changed and this is the new page map. If what the user asked for is already done, answer in one sentence and call NO tool. Otherwise do the single next step."
export const MAX_STEPS = 5
export const needsMore = (events: OrchestratorEvent[]) => events.some((e) => (e.type === "click" || e.type === "type_text" || e.type === "goto") && e.more)
// Let the new page render before it is read.
export const settle = () => new Promise((r) => setTimeout(r, 1100))
