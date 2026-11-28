import axios from "axios"

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  withCredentials: true,
})

// Which page a request came from, for the backend error log (it also marks the request as the web app's).
// Browser only; server-side requests send nothing. Raw fetch calls spread this into their headers.
export const pageHeader = (): Record<string, string> => (typeof window === "undefined" ? {} : { "x-plato-page": window.location.pathname })

// Why the session ended (an admin blocked the account): the login page shows it until the next try.
const LOGIN_NOTICE_KEY = "plato:login-notice"
export function readLoginNotice(): string | null {
  try {
    return sessionStorage.getItem(LOGIN_NOTICE_KEY)
  } catch {
    return null
  }
}
export function clearLoginNotice() {
  try {
    sessionStorage.removeItem(LOGIN_NOTICE_KEY)
  } catch {}
}

// The dead cookie goes first: the route guard (proxy.ts) sends anyone holding one away from /login.
let leaving = false
export function toLogin(notice?: string) {
  if (leaving) return
  leaving = true
  if (notice) {
    try {
      sessionStorage.setItem(LOGIN_NOTICE_KEY, notice)
    } catch {}
  }
  const next = encodeURIComponent(window.location.pathname + window.location.search)
  void apiClient.post("/auth/logout").catch(() => undefined).finally(() => window.location.assign(`/login?next=${next}`))
}

// A blocked account: every session is refused with 403 BLOCKED. Log out and say why on the login page
// (the login form shows the same message itself when a blocked account tries to log in).
export function handleBlocked(status: number | undefined, data: unknown): boolean {
  const body = data as { code?: string; message?: string } | null
  if (status !== 403 || body?.code !== "BLOCKED") return false
  if (typeof window !== "undefined" && window.location.pathname !== "/login") toLogin(body.message ?? "Your account is blocked. Contact support.")
  return true
}

// Paid actions: a 402 opens the "out of tokens" dialog wherever it came from,
// and any write may have spent tokens, so the balance refreshes (charges land a
// moment after the reply). Events, not imports: lib/credits imports this file.
if (typeof window !== "undefined") {
  apiClient.interceptors.request.use((config) => {
    config.headers.set(pageHeader())
    return config
  })
  apiClient.interceptors.response.use(
    (res) => {
      if (res.config.method && res.config.method !== "get") window.dispatchEvent(new Event("plato:tokens-changed"))
      return res
    },
    (error) => {
      const res = error?.response
      if (res?.status === 402 && res.data?.code === "insufficient_tokens") window.dispatchEvent(new CustomEvent("plato:out-of-tokens", { detail: res.data }))
      handleBlocked(res?.status, res?.data)
      // Dead session (expired, or the account is gone): back to login, then back here. Auth calls
      // own their 401s (a wrong password is a 401 too).
      if (res?.status === 401 && !String(error.config?.url ?? "").includes("/auth/") && window.location.pathname !== "/login") toLogin()
      return Promise.reject(error)
    },
  )
}

export { apiClient }
