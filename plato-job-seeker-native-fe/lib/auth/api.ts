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
      throw new Error(error.response?.data?.message ?? "Request failed")
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
const verifyEmail = (token: string) => request<{ ok: boolean }>(apiClient.post("/auth/verify-email", { token }))
const resendVerification = () => request<{ sent: boolean }>(apiClient.post("/auth/resend-verification"))

export { signup, login, logout, getMe, forgotPassword, resetPassword, verifyEmail, resendVerification }
