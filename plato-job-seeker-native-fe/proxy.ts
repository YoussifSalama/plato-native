import { NextRequest, NextResponse } from "next/server"

// Pages anyone may open, signed in or not.
const PUBLIC = ["/search", "/forgot-password", "/reset-password", "/verify-email", "/unsubscribe", "/welcome"]
// Pages only for the signed-out: a signed-in visitor goes home.
const AUTH = ["/login", "/signup"]
const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`))

// ponytail: presence-only check, no signature verification — the real
// authorization boundary is the backend's JwtAuthGuard. Verifying the JWT
// here would need an edge-compatible JWT lib for what's only a UX redirect.
// A dead cookie is cleared by the app's 401 handling (lib/api-client.ts), so /login ⇄ / can't loop.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = request.cookies.has("access_token")
  if (under(pathname, AUTH)) return hasSession ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next()
  if (under(pathname, PUBLIC)) return NextResponse.next()
  // The app's front door: a visitor without a session sees the job-seeker landing, at the same address.
  if (!hasSession && pathname === "/") return NextResponse.rewrite(new URL("/welcome", request.url))
  if (!hasSession) {
    // Back to the page they asked for once they have logged in.
    const login = new URL("/login", request.url)
    login.searchParams.set("next", pathname + search)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

export const config = {
  // Every page; not Next's own files or anything with a file extension (public/ assets).
  matcher: ["/((?!_next/|.*\\.\\w+$).*)"],
}
