"use server"

import type { ImportResult, MappedRow } from "@/lib/csv-import/importProducts"
import { importProducts } from "@/lib/erp/actions/definitions/imports"
import { invoke } from "@/lib/erp/actions/server"

export async function runImport(rows: MappedRow[]): Promise<ImportResult> {
  return invoke(importProducts, { rows })
}
