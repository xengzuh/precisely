"use server"

import { getSupabase } from "@/lib/supabase/server"
import { importProducts } from "@/lib/csv-import/importProducts"
import type { MappedRow, ImportResult } from "@/lib/csv-import/importProducts"

export async function runImport(rows: MappedRow[]): Promise<ImportResult> {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  return importProducts(supabase, user.id, rows)
}
