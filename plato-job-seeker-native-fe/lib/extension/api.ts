import { apiClient } from "@/lib/api-client"

export type PairingCode = { code: string; expires_at: string }
export type ExtensionDevice = { id: string; label: string; ext_version: string | null; created_at: string; last_used_at: string | null; expires_at: string }

// Cookie-authenticated web routes. The extension itself never uses these.
export const startPairing = async () => (await apiClient.post<PairingCode>("/extension/pairing/start")).data
// Job-site accounts (2026-11-21): the extension may make an applicant account on a career site. The password is made and
// kept encrypted in that browser only; Plato stores where the account is, never the password.
export type SiteAccount = { id: string; host: string; browser: string; device: string | null; device_linked: boolean; created_at: string }
export const getExtensionSettings = async () => (await apiClient.get<{ createAccounts: boolean }>("/extension/settings")).data
export const setCreateAccounts = async (createAccounts: boolean) => (await apiClient.post<{ createAccounts: boolean }>("/extension/settings", { createAccounts })).data
export const listSiteAccounts = async () => (await apiClient.get<SiteAccount[]>("/extension/site-accounts")).data
export const listDevices = async () => (await apiClient.get<ExtensionDevice[]>("/extension/devices")).data
export const removeDevice = async (id: string) => (await apiClient.delete(`/extension/devices/${id}`)).data
export const removeAllDevices = async () => (await apiClient.post<{ revoked: number }>("/extension/devices/revoke-all")).data
export const setSearchFeatured = async (id: string, featured: boolean) => (await apiClient.post(`/extension/searches/${id}/featured`, { featured })).data

export type ExtensionProgress = {
  online: boolean // a linked browser spoke to the server in the last 90 s
  linked: boolean
  counts: { waiting: number; working: number; needsYou: number; submitted: number; failed: number; skipped: number }
  active: number
  recent: { id: string; application_id: string | null; title: string; company: string; state: string; note: string | null; updated_at: string }[]
}
export const getExtensionProgress = async () => (await apiClient.get<ExtensionProgress>("/extension/progress")).data
// Put jobs in the extension's queue: each becomes a waiting job in the panel. Jobs whose site the
// extension cannot apply on (or already queued / applied) come back in `rejected` with the reason.
// `reapply`: the seeker confirmed applying again to jobs Plato already marked as sent.
export const createApplyBatch = async (jobIds: string[], resumes?: Record<string, "profile" | "tailored">, reapply?: boolean) =>
  (await apiClient.post<{ batch_id: string | null; items: { id: string; job_id: string }[]; rejected: { job_id: string; reason: string }[] }>("/extension/apply-batches", { jobIds, ...(resumes && { resumes }), ...(reapply && { reapply }) })).data
