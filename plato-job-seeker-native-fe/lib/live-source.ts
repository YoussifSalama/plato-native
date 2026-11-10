// A live event stream that is open only while this tab is visible.
//
// Why: in dev (and anywhere the API is served over HTTP/1.1) Chrome allows 6 open connections per host
// across ALL tabs. Every Plato tab used to hold its streams forever, so a few open tabs starved every
// other request and pages sat on their skeletons. A hidden tab now gives its connection back, and
// `onResume` catches up on whatever happened while it was away.
// ponytail: per-tab streams; share one across tabs (BroadcastChannel) only if visible tabs still starve.
export function liveSource(url: string, onMessage: (e: MessageEvent) => void, onResume?: () => void): () => void {
  let es: EventSource | null = null
  const open = () => {
    if (es) return
    es = new EventSource(url, { withCredentials: true })
    es.onmessage = onMessage
  }
  const close = () => {
    es?.close()
    es = null
  }
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      open()
      onResume?.()
    } else close()
  }
  if (document.visibilityState === "visible") open()
  document.addEventListener("visibilitychange", onVisibility)
  return () => {
    document.removeEventListener("visibilitychange", onVisibility)
    close()
  }
}
