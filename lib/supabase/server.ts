import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/types/database"

/**
 * Request-scoped Supabase client for Server Components and Server Actions.
 *
 * Uses the anon key, so every query runs as the signed-in user and RLS decides
 * what they can see. This is the default path — reach for the service-role
 * client in `./service` only when there is no user session (webhooks, cron).
 */
export async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components cannot set cookies — middleware handles refresh
          }
        },
      },
    }
  )
}
