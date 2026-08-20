import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod"
import type { z } from "zod"
import { getAgentTools } from "@/lib/erp/actions/registry"
import { runAction } from "@/lib/erp/actions/run"
import { ActionError, type ActionContext, type AnyActionDefinition } from "@/lib/erp/actions/types"

/**
 * The bridge from the action registry to Anthropic tool definitions.
 *
 * This is the whole reason the registry exists. There is no second list of
 * agent capabilities to keep in sync: a tool here *is* an action, so anything
 * the agent can do is already policy-gated, audited, and revertible, and it
 * cannot reach a code path a person could not.
 *
 * A gated action returns `pending_approval` to the model rather than executing.
 * That is deliberate — the agent is told its request is queued and carries on
 * reasoning, instead of being handed a silent failure it might retry.
 */

type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; status: "pending_approval"; summary: string; actionId: string }
  | { ok: false; status: "error"; error: string }

async function invokeAction(
  definition: AnyActionDefinition,
  ctx: ActionContext,
  input: unknown
): Promise<ToolResult> {
  try {
    const outcome = await runAction(definition, input as z.input<z.ZodType>, ctx)

    if (outcome.status === "pending_approval") {
      return {
        ok: false,
        status: "pending_approval",
        summary: outcome.summary,
        actionId: outcome.actionId,
      }
    }

    return { ok: true, result: outcome.result }
  } catch (err) {
    // Hand validation and policy failures back as tool results rather than
    // throwing: the model can correct a bad argument on the next turn, and
    // killing the whole run over one rejected call loses the work so far.
    if (err instanceof ActionError) {
      return { ok: false, status: "error", error: `${err.code}: ${err.message}` }
    }
    return {
      ok: false,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

/**
 * Build the tool set for one agent run.
 *
 * `ctx` is captured per run so a tool call can never execute against a
 * different organization than the run it belongs to.
 */
export function buildTools(ctx: ActionContext, only?: string[]) {
  const definitions = getAgentTools().filter((d) => !only || only.includes(d.name))

  return definitions.map((definition) =>
    betaZodTool({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.schema as z.ZodObject<z.ZodRawShape>,
      run: async (input: unknown) => {
        const result = await invokeAction(definition, ctx, input)
        return JSON.stringify(result)
      },
    })
  )
}

/** Names the agent can call, for logging and for the policy screen. */
export function agentToolNames(): string[] {
  return getAgentTools().map((d) => d.name)
}
