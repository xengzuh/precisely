import type { z } from "zod"
import { getUserContext } from "./context"
import { runAction } from "./run"
import { ActionError, type ActionDefinition } from "./types"

/**
 * Run an action as the signed-in user and return its result directly.
 *
 * Human-initiated actions are never queued for approval — the person clicking
 * the button is the approval — so this collapses the ActionOutcome union down
 * to the result for UI call sites. Agent code uses `runAction` directly, since
 * it must handle the pending-approval branch.
 */
export async function invoke<S extends z.ZodType, TOut>(
  definition: ActionDefinition<S, TOut>,
  input: z.input<S>
): Promise<TOut> {
  const ctx = await getUserContext()
  const outcome = await runAction(definition, input, ctx)

  if (outcome.status === "pending_approval") {
    throw new ActionError(
      `${definition.name} was queued for approval unexpectedly`,
      "forbidden"
    )
  }

  return outcome.result
}
