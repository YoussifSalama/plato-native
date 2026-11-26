import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import type { LoginFormValues, SignupFormValues } from "./schema"

export type AuthUser = {
  id: string
  full_name: string
  email: string
  phone: string
  onboarding_completed?: boolean
  // Confirmed through the link in the welcome email.
  email_verified?: boolean
}

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) {
      // Validation errors come back as a list of zod issues: show the first one's words.
      const m = error.response?.data?.message
      throw new Error((Array.isArray(m) ? m[0]?.message : m) ?? "Request failed")
    }
    throw error
  }
}

function signup(input: SignupFormValues): Promise<AuthUser> {
  const { fullName, email, phone, password } = input
  return request(apiClient.post("/auth/signup", { full_name: fullName, email, phone, password }))
}

function login(input: LoginFormValues): Promise<AuthUser> {
  return request(apiClient.post("/auth/login", input))
}

function logout(): Promise<{ success: boolean }> {
  return request(apiClient.post("/auth/logout"))
}

function getMe(): Promise<AuthUser> {
  return request(apiClient.get("/auth/me"))
}

// Password reset and email confirmation (links sent by email).
const forgotPassword = (email: string) => request<{ ok: boolean }>(apiClient.post("/auth/forgot-password", { email }))
const resetPassword = (token: string, password: string) => request<{ ok: boolean }>(apiClient.post("/auth/reset-password", { token, password }))
const verifyEmail = (token: string) => request<{ ok: boolean; email?: string }>(apiClient.post("/auth/verify-email", { token }))
const resendVerification = () => request<{ sent: boolean }>(apiClient.post("/auth/resend-verification"))

// Settings.
const updateMe = (patch: { full_name?: string; phone?: string }) => request<AuthUser>(apiClient.patch("/auth/me", patch))
const changeEmail = (email: string, password: string) => request<{ sent: boolean }>(apiClient.post("/auth/change-email", { email, password }))
const changePassword = (current: string, next: string) => request<{ ok: boolean }>(apiClient.post("/auth/change-password", { current, next }))
const logoutEverywhere = () => request<{ success: boolean }>(apiClient.post("/auth/logout-all"))
const deleteAccount = (password: string) => request<{ ok: boolean }>(apiClient.delete("/auth/account", { data: { password } }))
const exportUrl = () => `${apiClient.defaults.baseURL}/auth/account/export`

// Where to go after logging in: only a path on this site ("/jobs?x=1"), never "//evil.com" or "https://…".
function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null
  try {
    const u = new URL(raw, "http://x")
    return u.origin === "http://x" && !u.pathname.startsWith("/login") ? u.pathname + u.search + u.hash : null
  } catch {
    return null
  }
}

export { signup, login, logout, getMe, forgotPassword, resetPassword, verifyEmail, resendVerification, updateMe, changeEmail, changePassword, logoutEverywhere, deleteAccount, exportUrl, safeNext }
