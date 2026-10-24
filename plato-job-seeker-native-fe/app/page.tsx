"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getMe } from "@/lib/auth/api"

// ponytail: Home for returning users isn't built yet — route by auth state.
export default function Home() {
  const router = useRouter()
  useEffect(() => {
    getMe()
      .then((me) => router.replace(me.onboarding_completed ? "/jobs" : "/onboarding"))
      .catch(() => router.replace("/login"))
  }, [router])
  return null
}
