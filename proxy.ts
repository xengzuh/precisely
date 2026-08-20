import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Endpoints that must not be redirected to the login page.
 *
 * These are machine-to-machine and carry their own authentication — the
 * inbound webhook verifies an HMAC over the request body before reading it.
 * Sending them through the session check does not make them safer, it breaks
 * them: an unauthenticated POST gets a 200 and the login page's HTML, so the
 * caller believes it succeeded while nothing was processed.
 *
 * Every other /api route stays behind the session check on purpose — the
 * report and invoice PDF routes serve tenant data to a signed-in user.
 */
const PUBLIC_PREFIXES = ["/api/inbound/"]

export async function proxy(request: NextRequest) {
  if (PUBLIC_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Always use getUser() — it validates the JWT with Supabase servers
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isLoginPage = pathname === "/login"

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
