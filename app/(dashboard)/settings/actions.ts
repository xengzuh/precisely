"use server"

import { updateOrganization } from "@/lib/erp/actions/definitions/org"
import { invoke } from "@/lib/erp/actions/server"

/** Thin wrapper over the action registry — see CLAUDE.md rule 1. */
export async function saveOrganization(input: {
  name: string
  currency: string
  taxRate: number
  taxLabel: string
  locale: string
}) {
  await invoke(updateOrganization, input)
}
