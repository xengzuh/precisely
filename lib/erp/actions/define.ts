import type { z } from "zod"
import type { ActionDefinition, ActionSpec } from "./types"

/**
 * Declare a business operation.
 *
 * Every write in the system goes through one of these — the UI and the agents
 * both call `runAction(name, input, ctx)`, so approval gating, the audit trail,
 * and undo are applied uniformly and an agent can never reach a code path a
 * user could not.
 *
 * Defaults are deliberately conservative: an action that does not state its
 * autonomy mode requires human approval when an agent invokes it.
 */
export function defineAction<S extends z.ZodType, TOut>(
  spec: ActionSpec<S, TOut>
): ActionDefinition<S, TOut> {
  return {
    ...spec,
    defaultMode: spec.defaultMode ?? "approve",
    minRole: spec.minRole ?? "operator",
    agentExposed: spec.agentExposed ?? true,
  }
}
