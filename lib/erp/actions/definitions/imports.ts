import { z } from "zod"
import { normalizeRows, type ImportResult, type MappedRow } from "@/lib/csv-import/importProducts"
import { defineAction } from "../define"
import { ActionError } from "../types"

const cell = z.union([z.string(), z.number()]).optional()

export const importProducts = defineAction({
  name: "import_products",
  description:
    "Bulk-create products from spreadsheet rows. Existing SKUs are skipped rather than overwritten. " +
    "Opening quantities are posted to the stock ledger.",
  defaultMode: "approve",
  schema: z.object({
    rows: z
      .array(
        z.object({
          name: cell,
          sku: cell,
          baseUom: cell,
          densityKgPerL: cell,
          costPrice: cell,
          listPrice: cell,
          openingQty: cell,
          reorderPoint: cell,
          grade: cell,
          concentrationPct: cell,
          lotCode: cell,
        })
      )
      .min(1, "Nothing to import")
      .max(5000, "Import at most 5000 rows at a time"),
  }),
  risk: (i) => (i.rows.length > 500 ? "medium" : "low"),
  summarize: (i) => `Import ${i.rows.length} product row(s)`,
  revalidate: ["/inventory", "/dashboard"],
  async execute(ctx, input): Promise<ImportResult> {
    const { valid, errors } = normalizeRows(input.rows as MappedRow[])

    if (valid.length === 0) {
      return { imported: 0, skipped: 0, errors: errors.length ? errors : ["No valid rows to import"] }
    }

    const { data: existing, error: lookupError } = await ctx.db
      .from("products")
      .select("sku")
      .eq("org_id", ctx.orgId)
      .in(
        "sku",
        valid.map((r) => r.sku)
      )

    if (lookupError) throw new ActionError(lookupError.message, "execution_failed")

    const taken = new Set((existing ?? []).map((r) => r.sku))
    const toInsert = valid.filter((r) => !taken.has(r.sku))
    const skipped = valid.length - toInsert.length

    if (toInsert.length === 0) return { imported: 0, skipped, errors }

    const { data: inserted, error: insertError } = await ctx.db
      .from("products")
      .insert(
        toInsert.map((r) => ({
          org_id: ctx.orgId,
          sku: r.sku,
          name: r.name,
          grade: r.grade,
          concentration_pct: r.concentrationPct,
          base_uom: r.baseUom,
          density_kg_per_l: r.densityKgPerL,
          cost_price: r.costPrice,
          list_price: r.listPrice,
          reorder_point: r.reorderPoint,
          // A lot code in the file means the customer tracks batches for this
          // product, so turn tracking on rather than silently ignoring it.
          is_batch_tracked: r.lotCode !== null,
        }))
      )
      .select("id, sku")

    if (insertError) throw new ActionError(insertError.message, "execution_failed")

    // Opening balances go through the ledger, one move per product, so the
    // ledger reconciles against stock on hand from the very first import.
    const bySku = new Map((inserted ?? []).map((p) => [p.sku, p.id]))

    for (const row of toInsert) {
      if (row.openingQty <= 0) continue
      const productId = bySku.get(row.sku)
      if (!productId) continue

      const { error } = await ctx.db.rpc("post_stock_move", {
        p_org: ctx.orgId,
        p_product: productId,
        p_direction: "in",
        p_qty: row.openingQty,
        p_reason: "import",
        p_lot_code: row.lotCode,
        p_unit_cost: row.costPrice,
      })

      if (error) errors.push(`${row.sku}: imported, but opening stock failed — ${error.message}`)
    }

    return { imported: toInsert.length, skipped, errors }
  },
})
