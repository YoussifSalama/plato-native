"use client"

import { useEffect } from "react"

/**
 * While `active`, warn before the seeker leaves a running interview, voice call or test:
 *  - refresh, closing the tab or window, typing another address: the browser's own "Leave site?" prompt
 *    (browsers show their fixed text; a custom message is not allowed there)
 *  - any link inside Plato (Next's <Link> navigates without unloading the page): a confirm with `message`
 * ponytail: the browser Back button is not caught (Next owns popstate); add a history sentinel if it matters.
 */
export function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = "" // older browsers need it set to show the prompt
    }
    // capture phase on the document: runs before React and Next's Link handler, which skip a prevented click
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return
      const to = new URL(a.href, window.location.href)
      if (to.origin === window.location.origin && to.pathname === window.location.pathname && to.search === window.location.search) return
      if (!window.confirm(message)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", onUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [active, message])
}
