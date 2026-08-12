import type { SupabaseClient } from "@supabase/supabase-js"
import type { z } from "zod"
import type {
  ActionRisk,
  AgentActionRow,
  AutonomyMode,
  Database,
  MemberRole,
} from "@/types/database"

export type Risk = ActionRisk

/**
 * Everything an action needs to know about who is asking.
 *
 * `db` is the caller's own Supabase client: the RLS-bound SSR client for a
 * signed-in user, or a service-role client for a background agent run. Because
 * the latter bypasses RLS, **every query inside an action must filter on
 * `ctx.orgId`** (or call an RPC that takes `p_org`). That is the one rule that
 * keeps tenants apart on the agent path.
 */
export interface ActionContext {
  orgId: string
  userId: string | null
  role: MemberRole
  actor: "user" | "agent"
  /** agent_runs.id when this action belongs to an agent run. */
  runId: string | null
  db: SupabaseClient<Database>
}

export interface ActionSpec<S extends z.ZodType, TOut> {
  /** Stable identifier. Used as the agent tool name and the policy key. */
  name: string
  /** Doubles as the tool description the model reads — write it for the model. */
  description: string
  schema: S
  /** Policy when the org has no `autonomy_policies` row. Conservative default. */
  defaultMode?: AutonomyMode
  /** Lowest role permitted to invoke this. Defaults to `operator`. */
  minRole?: MemberRole
  risk: (input: z.infer<S>, ctx: ActionContext) => Risk
  /**
   * Monetary value of the action, compared against the policy threshold.
   * Return null when the action has no value dimension.
   */
  amount?: (input: z.infer<S>, ctx: ActionContext) => Promise<number | null> | number | null
  /** One-line human summary for the approval inbox. */
  summarize: (input: z.infer<S>) => string
  execute: (ctx: ActionContext, input: z.infer<S>) => Promise<TOut>
  /** Undo. Omit when the action genuinely cannot be reversed. */
  revert?: (ctx: ActionContext, record: AgentActionRow) => Promise<void>
  /** App Router paths to revalidate after a successful execution. */
  revalidate?: string[]
  /** Whether to expose this as a tool to agents. Read-only helpers included. */
  agentExposed?: boolean
}

export interface ActionDefinition<S extends z.ZodType = z.ZodType, TOut = unknown>
  extends ActionSpec<S, TOut> {
  defaultMode: AutonomyMode
  minRole: MemberRole
  agentExposed: boolean
}

// The registry is heterogeneous, so it holds definitions at their widest type.
export type AnyActionDefinition = ActionDefinition<z.ZodType, unknown>

export type ActionOutcome<TOut = unknown> =
  | { status: "executed"; actionId: string; result: TOut }
  | { status: "pending_approval"; actionId: string; summary: string }

export class ActionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unknown_action"
      | "invalid_input"
      | "forbidden"
      | "disabled"
      | "execution_failed"
  ) {
    super(message)
    this.name = "ActionError"
  }
}

const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
}

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}
