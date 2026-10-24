import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import type { Preferences, PreferencesEditPayload } from "./schema"

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

export { getPreferences, savePreferences }
