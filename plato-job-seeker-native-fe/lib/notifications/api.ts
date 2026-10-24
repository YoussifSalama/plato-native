import { apiClient } from "@/lib/api-client"

export type NotificationTone = "success" | "warning" | "error" | "info"

// Derived server-side from search runs and applications. `id` encodes the
// state (`app:{id}:{status}`), so a status change arrives as a new item.
export type SeekerNotification = {
  id: string
  // queue: live-only batch messages (ETA when 5+ are queued, summary when done).
  kind: "run" | "application" | "queue"
  status: string
  tone: NotificationTone
  title: string
  body: string
  href: string
  at: string
}

export const listNotifications = async () => (await apiClient.get<SeekerNotification[]>("/job-seeker/notifications")).data
export const notificationEventsUrl = () => `${apiClient.defaults.baseURL}/job-seeker/notifications/events`
