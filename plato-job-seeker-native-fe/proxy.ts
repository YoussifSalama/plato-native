import { NextRequest, NextResponse } from "next/server"

// ponytail: presence-only check, no signature verification — the real
// authorization boundary is the backend's JwtAuthGuard. Verifying the JWT
// here would need an edge-compatible JWT lib for what's only a UX redirect.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("access_token")
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/onboarding/:path*"],
}
