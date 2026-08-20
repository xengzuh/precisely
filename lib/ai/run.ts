import { getServiceClient } from "@/lib/supabase/service"
import type { AgentTrigger } from "@/types/database"
import { MODEL, type Usage } from "./client"

/**
 * The agent_runs ledger.
 *
 * Every model invocation gets a row before it starts and is closed out after,
 * success or failure. Without this an agent that misbehaves at 3am leaves no
 * trace of what it cost or what set it off — and the individual agent_actions
 * rows tell you what it *did* but not what it was trying to do.
 */

export async function startRun(input: {
  orgId: string
  agent: string
  trigger: AgentTrigger
  inputRef?: string | null
}): Promise<string> {
  const service = getServiceClient(input.orgId)

  const { data, error } = await service.unsafe
    .from("agent_runs")
    .insert({
      org_id: input.orgId,
      agent: input.agent,
      trigger: input.trigger,
      status: "running",
      model: MODEL,
      input_ref: input.inputRef ?? null,
    })
    .select("id")
    .single()

  if (error) throw new Error(`Could not open an agent run: ${error.message}`)
  return data.id
}

export async function finishRun(input: {
  orgId: string
  runId: string
  usage?: Usage
  error?: string | null
}): Promise<void> {
  const service = getServiceClient(input.orgId)

  await service.unsafe
    .from("agent_runs")
    .update({
      status: input.error ? "failed" : "succeeded",
      tokens_in: input.usage?.inputTokens ?? 0,
      tokens_out: input.usage?.outputTokens ?? 0,
      cache_read_tokens: input.usage?.cacheReadTokens ?? 0,
      cache_write_tokens: input.usage?.cacheWriteTokens ?? 0,
      cost_usd: input.usage?.costUsd ?? 0,
      // Truncated: a stack trace from a failed parse can run to kilobytes, and
      // this column is read in a list view.
      error: input.error ? input.error.slice(0, 2000) : null,
      ended_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
}

/** Run `work` inside a ledger entry, closing it out either way. */
export async function withRun<T>(
  input: { orgId: string; agent: string; trigger: AgentTrigger; inputRef?: string | null },
  work: (runId: string) => Promise<{ result: T; usage?: Usage }>
): Promise<T> {
  const runId = await startRun(input)

  try {
    const { result, usage } = await work(runId)
    await finishRun({ orgId: input.orgId, runId, usage })
    return result
  } catch (err) {
    await finishRun({
      orgId: input.orgId,
      runId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
