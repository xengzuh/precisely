"use server"

import { upsertPackageType } from "@/lib/erp/actions/definitions/products"
import { invoke } from "@/lib/erp/actions/server"
import type { Uom } from "@/types/database"

/** Thin wrapper over the action registry — see CLAUDE.md rule 1. */
export async function savePackageType(input: {
  packageTypeId?: string | null
  productId: string
  name: string
  qtyPerPackage: number
  uom: Uom
  tareKg?: number | null
  isDefault?: boolean
}) {
  await invoke(upsertPackageType, input)
}
