import { apiClient } from "@/lib/api-client"

export type PairingCode = { code: string; expires_at: string }
export type ExtensionDevice = { id: string; label: string; ext_version: string | null; created_at: string; last_used_at: string | null; expires_at: string }

// Cookie-authenticated web routes. The extension itself never uses these.
export const startPairing = async () => (await apiClient.post<PairingCode>("/extension/pairing/start")).data
export const listDevices = async () => (await apiClient.get<ExtensionDevice[]>("/extension/devices")).data
export const removeDevice = async (id: string) => (await apiClient.delete(`/extension/devices/${id}`)).data
export const removeAllDevices = async () => (await apiClient.post<{ revoked: number }>("/extension/devices/revoke-all")).data
export const setSearchFeatured = async (id: string, featured: boolean) => (await apiClient.post(`/extension/searches/${id}/featured`, { featured })).data

export type ExtensionProgress = {
  online: boolean // a linked browser spoke to the server in the last 90 s
  linked: boolean
  counts: { waiting: number; working: number; needsYou: number; submitted: number; failed: number; skipped: number }
  active: number
  recent: { id: string; title: string; company: string; state: string; note: string | null; updated_at: string }[]
}
export const getExtensionProgress = async () => (await apiClient.get<ExtensionProgress>("/extension/progress")).data
// Put jobs in the extension's queue: each becomes a waiting job in the panel. Jobs whose site the
// extension cannot apply on (or already queued / applied) come back in `rejected` with the reason.
export const createApplyBatch = async (jobIds: string[]) =>
  (await apiClient.post<{ batch_id: string | null; items: { id: string; job_id: string }[]; rejected: { job_id: string; reason: string }[] }>("/extension/apply-batches", { jobIds })).data
