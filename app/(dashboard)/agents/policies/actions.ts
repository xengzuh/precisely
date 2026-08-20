"use server"

import { setAutonomyPolicy } from "@/lib/erp/actions/definitions/org"
import { invoke } from "@/lib/erp/actions/server"
import type { AutonomyMode } from "@/types/database"

/** Thin wrapper over the action registry — see CLAUDE.md rule 1. */
export async function savePolicy(input: {
  action: string
  mode: AutonomyMode
  thresholdAmount: number | null
}) {
  await invoke(setAutonomyPolicy, input)
}
