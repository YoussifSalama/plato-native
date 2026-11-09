import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import type { PreferenceEstimate, Preferences, PreferencesEditPayload } from "./schema"

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

function getPreferences(): Promise<Preferences> {
  return request(apiClient.get("/job-seeker/preferences"))
}

function savePreferences(data: PreferencesEditPayload): Promise<Preferences> {
  return request(apiClient.patch("/job-seeker/preferences", data))
}

// Live while the seeker edits onboarding: no AI, no tokens.
function estimatePreferences(draft: Pick<Preferences, "roles" | "preferred_locations" | "work_setup" | "willing_to_relocate" | "salary_min" | "salary_max" | "salary_currency" | "salary_period">): Promise<PreferenceEstimate> {
  return request(apiClient.post("/job-seeker/preferences/estimate", draft))
}

export { getPreferences, savePreferences, estimatePreferences }
