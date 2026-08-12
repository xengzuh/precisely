import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabase } from "@/lib/supabase/server"
import { getServiceClient } from "@/lib/supabase/service"
import type { Database, MemberRole } from "@/types/database"
import { ActionError, type ActionContext } from "./types"

export class NoOrganizationError extends Error {
  constructor() {
    super("This account does not belong to an organization yet")
    this.name = "NoOrganizationError"
  }
}

/**
 * Build an ActionContext for the signed-in user.
 *
 * Pass `orgId` to pin a specific organization; membership is verified either
 * way, so a forged id gets a forbidden error rather than access.
 */
export async function getUserContext(orgId?: string): Promise<ActionContext> {
  const db = await getSupabase()

  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) throw new ActionError("Not authenticated", "forbidden")

  let query = db.from("memberships").select("org_id, role").eq("user_id", user.id)
  if (orgId) query = query.eq("org_id", orgId)

  const { data, error } = await query.order("created_at", { ascending: true }).limit(1)

  if (error) throw new ActionError(error.message, "forbidden")
  if (!data || data.length === 0) {
    if (orgId) throw new ActionError("Not a member of this organization", "forbidden")
    throw new NoOrganizationError()
  }

  return {
    orgId: data[0].org_id,
    userId: user.id,
    role: data[0].role as MemberRole,
    actor: "user",
    runId: null,
    db: db as unknown as SupabaseClient<Database>,
  }
}

/**
 * Build an ActionContext for an autonomous agent run.
 *
 * There is no user session here — a webhook or a scheduled job triggered this —
 * so it runs on the service role and RLS does not apply. `orgId` must come from
 * a trusted source (the inbound_documents row, the schedule config), never from
 * anything the payload itself supplied.
 */
export async function getAgentContext(orgId: string, runId: string | null): Promise<ActionContext> {
  const service = getServiceClient(orgId)

  return {
    orgId,
    // Agents act with operator authority: enough to draft and move stock, not
    // enough to change org settings or membership.
    role: "operator",
    userId: null,
    actor: "agent",
    runId,
    db: service.unsafe as unknown as SupabaseClient<Database>,
  }
}

/** Convenience for pages: the caller's organization id, or null if none yet. */
export async function getActiveOrgId(): Promise<string | null> {
  try {
    const ctx = await getUserContext()
    return ctx.orgId
  } catch (err) {
    if (err instanceof NoOrganizationError) return null
    throw err
  }
}
