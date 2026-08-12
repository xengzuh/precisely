import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type AllTables = Database["public"]["Tables"]

/**
 * Tables that actually carry an org_id, so the scoping helpers below can only
 * be pointed at something they can genuinely scope. `organizations` is keyed by
 * `id` and is excluded by construction rather than by remembering not to.
 */
type TableName = {
  [K in keyof AllTables]: "org_id" extends keyof AllTables[K]["Row"] ? K : never
}[keyof AllTables]

/**
 * Service-role access, always scoped to one organization.
 *
 * The service role bypasses RLS entirely, so tenant isolation stops being the
 * database's job and becomes ours. This is the highest-risk surface in the
 * codebase: a query that forgets `org_id` returns every tenant's rows.
 *
 * The mitigation is structural rather than a convention — there is no way to
 * obtain a service-role client without naming an organization, and `read()`
 * and `insert()` apply the filter for you. Anything that genuinely needs the
 * raw client has to go through `.unsafe`, which is greppable.
 *
 * Only use this where there is no user session: inbound email webhooks,
 * scheduled agent runs, background jobs. Anything triggered by a signed-in
 * user must go through `getSupabase()` in `./server` so RLS still applies.
 */
export class OrgScopedService {
  constructor(
    /** Raw service-role client. Bypasses RLS — filter by org_id yourself. */
    readonly unsafe: ReturnType<typeof createClient<Database>>,
    readonly orgId: string
  ) {}

  /** SELECT pre-filtered to this organization. */
  read<T extends TableName>(table: T) {
    // `org_id` is present on every T by construction, but TypeScript cannot
    // see that through the mapped type, so the filter key is cast once here
    // instead of at each call site.
    return this.unsafe
      .from(table)
      .select("*")
      .eq("org_id" as never, this.orgId as never)
  }

  /** INSERT with org_id forced onto every row, overriding any caller value. */
  insert<T extends TableName>(
    table: T,
    rows: Omit<AllTables[T]["Insert"], "org_id"> | Omit<AllTables[T]["Insert"], "org_id">[]
  ) {
    const list = Array.isArray(rows) ? rows : [rows]
    const scoped = list.map((row) => ({ ...row, org_id: this.orgId }))
    return this.unsafe.from(table).insert(scoped as never)
  }

  /** UPDATE pre-filtered to this organization. */
  update<T extends TableName>(table: T, patch: AllTables[T]["Update"]) {
    return this.unsafe
      .from(table)
      .update(patch as never)
      .eq("org_id" as never, this.orgId as never)
  }

  /**
   * Call a Postgres function. Functions taking `p_org` get it injected; the
   * rest (which resolve the org from their own row) are passed through.
   */
  rpc<T extends keyof Database["public"]["Functions"]>(
    fn: T,
    args: Omit<Database["public"]["Functions"][T]["Args"], "p_org">
  ) {
    return this.unsafe.rpc(fn, { ...args, p_org: this.orgId } as never)
  }
}

export function getServiceClient(orgId: string): OrgScopedService {
  // Belt and braces: the key has no NEXT_PUBLIC_ prefix so it is never bundled
  // for the browser, but fail loudly rather than silently if this is ever
  // imported into a client component. (Swap for the `server-only` package once
  // it is added as a dependency — that turns this into a build-time error.)
  if (typeof window !== "undefined") {
    throw new Error("getServiceClient must never be called in the browser")
  }

  if (!orgId) {
    throw new Error("getServiceClient requires an organization id")
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
        "The service-role key is server-only — never expose it with a NEXT_PUBLIC_ prefix."
    )
  }

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return new OrgScopedService(client, orgId)
}
