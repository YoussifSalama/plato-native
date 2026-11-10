// Voice practice from anywhere in Career: the app-wide assistant listens for "plato:voice" and
// opens the voice call panel (setup screen first, nothing starts until the seeker presses Start).
//   openVoice({ mode: "practice", focus: "Salary negotiation role-play: …", focusTitle: "Salary negotiation" })
export type VoiceRequest = {
  mode?: "practice" | "mock" | "skill"
  // What the interviewer runs (sent to the server as the session's format, max 300 chars).
  focus?: string
  // Short name shown in the setup: "Format: Behavioral (STAR)".
  focusTitle?: string
  role?: string
  skill?: string
  job?: { title: string; description: string }
}

export const VOICE_EVENT = "plato:voice"

export function openVoice(req: VoiceRequest = {}) {
  window.dispatchEvent(new CustomEvent<VoiceRequest>(VOICE_EVENT, { detail: req }))
}

// One line describing a matched job, for a voice call when the full posting is not on hand.
export function jobBrief(j: { title: string; company: string; location?: string | null }, reasons?: string[]) {
  return [`${j.title} at ${j.company}${j.location ? ` (${j.location})` : ""}.`, reasons?.length ? `The posting mentions: ${reasons.slice(0, 8).join(", ")}.` : ""].filter(Boolean).join(" ")
}
