import axios from "axios"

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  withCredentials: true,
})

// Paid actions: a 402 opens the "out of tokens" dialog wherever it came from,
// and any write may have spent tokens, so the balance refreshes (charges land a
// moment after the reply). Events, not imports: lib/credits imports this file.
if (typeof window !== "undefined") {
  apiClient.interceptors.response.use(
    (res) => {
      if (res.config.method && res.config.method !== "get") window.dispatchEvent(new Event("plato:tokens-changed"))
      return res
    },
    (error) => {
      const res = error?.response
      if (res?.status === 402 && res.data?.code === "insufficient_tokens") window.dispatchEvent(new CustomEvent("plato:out-of-tokens", { detail: res.data }))
      return Promise.reject(error)
    },
  )
}

export { apiClient }
