import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

export type MappedRow = {
  name: string
  sku: string
  stock: number
  price: number
}

export type ImportResult = {
  imported: number
  skipped: number
  errors: string[]
}

export async function importProducts(
  supabase: SupabaseClient,
  userId: string,
  rawRows: MappedRow[]
): Promise<ImportResult> {
  const errors: string[] = []
  const toInsert: MappedRow[] = []
  let skipped = 0

  // Validate and clean each row
  const validRows: MappedRow[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const rowLabel = `Row ${i + 2}` // +2 because row 1 is headers

    const name = row.name?.trim() ?? ""
    const sku = row.sku?.trim() ?? ""
    if (!name || !sku) {
      if (!name && !sku) continue // silently skip fully empty rows
      errors.push(`${rowLabel}: Name and SKU are both required`)
      continue
    }

    const stock = Number.isInteger(row.stock) && row.stock >= 0 ? row.stock : 0
    const price = isFinite(row.price) && row.price >= 0 ? row.price : 0

    validRows.push({ name, sku, stock, price })
  }

  if (validRows.length === 0) {
    return { imported: 0, skipped: 0, errors: errors.length ? errors : ["No valid rows to import"] }
  }

  // Fetch all existing SKUs for this user to deduplicate
  const skusToCheck = validRows.map((r) => r.sku)
  const { data: existing } = await supabase
    .from("products")
    .select("sku")
    .in("sku", skusToCheck)
    .eq("user_id", userId)

  const existingSkus = new Set((existing ?? []).map((r: { sku: string }) => r.sku))

  for (const row of validRows) {
    if (existingSkus.has(row.sku)) {
      skipped++
    } else {
      toInsert.push(row)
    }
  }

  if (toInsert.length === 0) {
    return { imported: 0, skipped, errors }
  }

  // Batch insert with user_id
  const { error: insertError } = await supabase.from("products").insert(
    toInsert.map((r) => ({ ...r, user_id: userId }))
  )

  if (insertError) {
    errors.push(`Database error: ${insertError.message}`)
    return { imported: 0, skipped, errors }
  }

  revalidatePath("/inventory")
  revalidatePath("/dashboard")

  return { imported: toInsert.length, skipped, errors }
}
