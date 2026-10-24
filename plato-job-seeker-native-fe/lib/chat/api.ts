import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"

export type ChatMessage = { role: "user" | "assistant"; content: string }

async function sendChatMessage(messages: ChatMessage[], stage?: number): Promise<string> {
  try {
    const { data } = await apiClient.post<{ reply: string }>("/chat", { messages, stage })
    return data.reply
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new Error(error.response?.data?.message ?? "Chat request failed")
    }
    throw error
  }
}

export { sendChatMessage }
