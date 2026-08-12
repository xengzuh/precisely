import { revalidatePath } from "next/cache"
import type { z } from "zod"
import type { AgentActionRow, AutonomyMode, Json } from "@/types/database"
import { getRegistry } from "./registry"
import {
  ActionError,
  roleAtLeast,
  type ActionContext,
  type ActionDefinition,
  type ActionOutcome,
  type AnyActionDefinition,
  type Risk,
} from "./types"

interface ResolvedPolicy {
  mode: AutonomyMode
  threshold: number | null
}

async function resolvePolicy(
  ctx: ActionContext,
  definition: AnyActionDefinition
): Promise<ResolvedPolicy> {
  const { data } = await ctx.db
    .from("autonomy_policies")
    .select("mode, threshold_amount")
    .eq("org_id", ctx.orgId)
    .eq("action", definition.name)
    .maybeSingle()

  return {
    mode: (data?.mode as AutonomyMode) ?? definition.defaultMode,
    threshold: data?.threshold_amount ?? null,
  }
}

/**
 * Decide whether an agent-initiated action needs a human first.
 *
 * Three independent reasons to gate, any of which is sufficient:
 *   - the org set this action to `approve`
 *   - the action's value exceeds the org's threshold
 *   - the action classified itself as high risk
 *
 * The last one is deliberately not overridable by policy. An org can put
 * `create_sales_order` on auto, but an individual order the action itself
 * flagged as high risk still stops for review.
 */
function shouldGate(policy: ResolvedPolicy, risk: Risk, amount: number | null): boolean {
  if (policy.mode === "approve") return true
  if (risk === "high") return true
  if (policy.threshold !== null && amount !== null && amount > policy.threshold) return true
  return false
}

function revalidate(definition: AnyActionDefinition): void {
  for (const path of definition.revalidate ?? []) {
    revalidatePath(path)
  }
}

/**
 * Execute a business operation with policy gating, auditing, and revalidation.
 *
 * Human-initiated actions are never gated — the person clicking the button is
 * the approval — but they are still audited, so `agent_actions` is a complete
 * record of everything that changed the books, by whom, and with what inputs.
 */
export async function runAction<S extends z.ZodType, TOut>(
  definition: ActionDefinition<S, TOut>,
  rawInput: unknown,
  ctx: ActionContext
): Promise<ActionOutcome<TOut>> {
  const parsed = definition.schema.safeParse(rawInput)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ")
    throw new ActionError(detail, "invalid_input")
  }
  const input = parsed.data as z.infer<S>

  if (!roleAtLeast(ctx.role, definition.minRole)) {
    throw new ActionError(
      `${definition.name} requires the ${definition.minRole} role`,
      "forbidden"
    )
  }

  const risk = definition.risk(input, ctx)
  const amount = (await definition.amount?.(input, ctx)) ?? null
  const summary = definition.summarize(input)

  let gated = false
  if (ctx.actor === "agent") {
    const policy = await resolvePolicy(ctx, definition)
    if (policy.mode === "off") {
      throw new ActionError(`${definition.name} is disabled for this organization`, "disabled")
    }
    gated = shouldGate(policy, risk, amount)
  }

  const { data: record, error: auditError } = await ctx.db
    .from("agent_actions")
    .insert({
      org_id: ctx.orgId,
      run_id: ctx.runId,
      action: definition.name,
      args: input as Json,
      risk,
      actor: ctx.actor,
      status: gated ? "proposed" : "approved",
      summary,
      requested_by: ctx.userId,
      approved_by: gated ? null : ctx.userId,
      approved_at: gated ? null : new Date().toISOString(),
    })
    .select("id")
    .single()

  if (auditError || !record) {
    throw new ActionError(auditError?.message ?? "Could not record action", "execution_failed")
  }

  if (gated) {
    return { status: "pending_approval", actionId: record.id, summary }
  }

  return executeRecorded(definition, input, ctx, record.id)
}

/** Shared by the direct path and by approval — both run the same execute(). */
async function executeRecorded<S extends z.ZodType, TOut>(
  definition: ActionDefinition<S, TOut>,
  input: z.infer<S>,
  ctx: ActionContext,
  actionId: string
): Promise<ActionOutcome<TOut>> {
  try {
    const result = await definition.execute(ctx, input)

    await ctx.db
      .from("agent_actions")
      .update({
        status: "executed",
        result: (result ?? null) as Json,
        executed_at: new Date().toISOString(),
      })
      .eq("id", actionId)

    revalidate(definition)
    return { status: "executed", actionId, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    await ctx.db
      .from("agent_actions")
      .update({ status: "failed", error: message })
      .eq("id", actionId)

    throw new ActionError(message, "execution_failed")
  }
}

/** Registry lookup form, used by the agent tool bridge. */
export async function runActionByName(
  name: string,
  rawInput: unknown,
  ctx: ActionContext
): Promise<ActionOutcome> {
  const definition = getRegistry()[name]
  if (!definition) throw new ActionError(`Unknown action: ${name}`, "unknown_action")
  return runAction(definition, rawInput, ctx)
}

async function loadRecord(ctx: ActionContext, actionId: string): Promise<AgentActionRow> {
  const { data, error } = await ctx.db
    .from("agent_actions")
    .select("*")
    .eq("id", actionId)
    .eq("org_id", ctx.orgId)
    .single()

  if (error || !data) throw new ActionError("Action not found", "unknown_action")
  return data as AgentActionRow
}

function definitionFor(name: string): AnyActionDefinition {
  const definition = getRegistry()[name]
  if (!definition) throw new ActionError(`Unknown action: ${name}`, "unknown_action")
  return definition
}

/** Approve a proposed action and run it, as the approving user. */
export async function approveAction(actionId: string, ctx: ActionContext): Promise<ActionOutcome> {
  const record = await loadRecord(ctx, actionId)
  if (record.status !== "proposed") {
    throw new ActionError(`Action is already ${record.status}`, "forbidden")
  }

  const definition = definitionFor(record.action)
  if (!roleAtLeast(ctx.role, definition.minRole)) {
    throw new ActionError(`Approving ${record.action} requires the ${definition.minRole} role`, "forbidden")
  }

  // Re-validate the stored arguments: the schema may have tightened since the
  // action was proposed, and a queued action can sit for a long time.
  const parsed = definition.schema.safeParse(record.args)
  if (!parsed.success) {
    throw new ActionError("Stored arguments are no longer valid for this action", "invalid_input")
  }

  await ctx.db
    .from("agent_actions")
    .update({
      status: "approved",
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", actionId)

  return executeRecorded(definition, parsed.data, ctx, actionId)
}

export async function rejectAction(
  actionId: string,
  reason: string,
  ctx: ActionContext
): Promise<void> {
  const record = await loadRecord(ctx, actionId)
  if (record.status !== "proposed") {
    throw new ActionError(`Action is already ${record.status}`, "forbidden")
  }

  await ctx.db
    .from("agent_actions")
    .update({
      status: "rejected",
      rejected_reason: reason,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", actionId)

  revalidate(definitionFor(record.action))
}

/** Undo an executed action, if its definition knows how. */
export async function revertAction(actionId: string, ctx: ActionContext): Promise<void> {
  const record = await loadRecord(ctx, actionId)
  if (record.status !== "executed") {
    throw new ActionError(`Only an executed action can be reverted (this one is ${record.status})`, "forbidden")
  }

  const definition = definitionFor(record.action)
  if (!definition.revert) {
    throw new ActionError(`${record.action} cannot be reverted automatically`, "forbidden")
  }
  if (!roleAtLeast(ctx.role, "admin")) {
    throw new ActionError("Reverting requires the admin role", "forbidden")
  }

  await definition.revert(ctx, record)

  await ctx.db
    .from("agent_actions")
    .update({
      status: "reverted",
      reverted_at: new Date().toISOString(),
      reverted_by: ctx.userId,
    })
    .eq("id", actionId)

  revalidate(definition)
}
