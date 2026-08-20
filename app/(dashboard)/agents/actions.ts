"use server"

import { revalidatePath } from "next/cache"
import { getUserContext } from "@/lib/erp/actions/context"
import { approveAction, rejectAction, revertAction } from "@/lib/erp/actions/run"

/**
 * The approval inbox's write path.
 *
 * These do not go through `invoke` because they are not themselves registry
 * actions — they are the human decision *about* a queued action, and the
 * registry already audits what happens when one is approved.
 */

export async function approveProposal(actionId: string) {
  const ctx = await getUserContext()
  const outcome = await approveAction(actionId, ctx)
  revalidatePath("/agents")
  return outcome.status
}

export async function rejectProposal(actionId: string, reason: string) {
  const ctx = await getUserContext()
  // The reason is fed back to the agent, so a blank one wastes the correction.
  await rejectAction(actionId, reason.trim() || "Rejected without a reason", ctx)
  revalidatePath("/agents")
}

export async function revertExecuted(actionId: string) {
  const ctx = await getUserContext()
  await revertAction(actionId, ctx)
  revalidatePath("/agents")
}
