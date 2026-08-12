import { z } from "zod"
import { isoDate, uomSchema as uom } from "@/lib/erp/schema"
import { defineAction } from "../define"
import { ActionError, type ActionContext } from "../types"

async function loadProduct(ctx: ActionContext, productId: string) {
  const { data, error } = await ctx.db
    .from("products")
    .select("id, sku, name, base_uom, density_kg_per_l, list_price, is_batch_tracked")
    .eq("id", productId)
    .eq("org_id", ctx.orgId)
    .single()

  if (error || !data) throw new ActionError("Product not found", "invalid_input")
  return data
}

export const createProduct = defineAction({
  name: "create_product",
  description:
    "Add a product to the catalog. Quantities for this product will be tracked in its base unit of measure. " +
    "Set density_kg_per_l for any liquid so mass and volume orders can be converted.",
  defaultMode: "approve",
  schema: z.object({
    sku: z.string().trim().min(1, "SKU is required"),
    name: z.string().trim().min(1, "Name is required"),
    description: z.string().trim().optional(),
    grade: z.string().trim().optional(),
    concentrationPct: z.number().min(0).max(100).nullable().optional(),
    baseUom: uom.default("ea"),
    densityKgPerL: z.number().positive().nullable().optional(),
    costPrice: z.number().min(0).default(0),
    listPrice: z.number().min(0).default(0),
    reorderPoint: z.number().min(0).nullable().optional(),
    reorderQty: z.number().min(0).nullable().optional(),
    isBatchTracked: z.boolean().default(false),
    shelfLifeDays: z.number().int().positive().nullable().optional(),
    openingQty: z.number().min(0).default(0),
    openingLotCode: z.string().trim().optional(),
    openingExpiry: isoDate.optional(),
  }),
  risk: () => "low",
  summarize: (i) => `Create product ${i.sku} — ${i.name}`,
  revalidate: ["/inventory", "/dashboard"],
  async execute(ctx, input) {
    if (input.isBatchTracked && input.openingQty > 0 && !input.openingLotCode) {
      throw new ActionError(
        "A batch-tracked product needs a lot code for its opening stock",
        "invalid_input"
      )
    }

    const { data, error } = await ctx.db
      .from("products")
      .insert({
        org_id: ctx.orgId,
        sku: input.sku,
        name: input.name,
        description: input.description ?? null,
        grade: input.grade ?? null,
        concentration_pct: input.concentrationPct ?? null,
        base_uom: input.baseUom,
        density_kg_per_l: input.densityKgPerL ?? null,
        cost_price: input.costPrice,
        list_price: input.listPrice,
        reorder_point: input.reorderPoint ?? null,
        reorder_qty: input.reorderQty ?? null,
        is_batch_tracked: input.isBatchTracked,
        shelf_life_days: input.shelfLifeDays ?? null,
      })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        throw new ActionError(`SKU "${input.sku}" is already taken`, "invalid_input")
      }
      throw new ActionError(error.message, "execution_failed")
    }

    // Opening stock goes through the ledger like everything else. The previous
    // implementation wrote an initial stock level with no movement row, so the
    // ledger never balanced against the stock on hand.
    if (input.openingQty > 0) {
      const { error: moveError } = await ctx.db.rpc("post_stock_move", {
        p_org: ctx.orgId,
        p_product: data.id,
        p_direction: "in",
        p_qty: input.openingQty,
        p_reason: "opening",
        p_lot_code: input.openingLotCode ?? null,
        p_expiry: input.openingExpiry ?? null,
        p_unit_cost: input.costPrice,
      })
      if (moveError) throw new ActionError(moveError.message, "execution_failed")
    }

    return { productId: data.id, sku: input.sku }
  },
})

export const adjustStock = defineAction({
  name: "adjust_stock",
  description:
    "Correct the stock level of a product, for stocktake differences, spillage, or write-offs. " +
    "Quantity is in the product's base unit unless a package type is given.",
  defaultMode: "approve",
  schema: z.object({
    productId: z.uuid(),
    direction: z.enum(["in", "out"]),
    qty: z.number().positive(),
    reason: z.enum(["adjustment", "return", "write_off"]).default("adjustment"),
    batchId: z.uuid().nullable().optional(),
    lotCode: z.string().trim().optional(),
    note: z.string().trim().optional(),
  }),
  // Stock corrections are how inventory fraud and honest mistakes both look,
  // so they are never low risk regardless of size.
  risk: () => "medium",
  summarize: (i) => `${i.direction === "in" ? "Add" : "Remove"} ${i.qty} (${i.reason})`,
  revalidate: ["/inventory", "/dashboard"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.rpc("post_stock_move", {
      p_org: ctx.orgId,
      p_product: input.productId,
      p_direction: input.direction,
      p_qty: input.qty,
      p_reason: input.reason,
      p_batch: input.batchId ?? null,
      p_lot_code: input.lotCode ?? null,
    })

    if (error) throw new ActionError(error.message, "execution_failed")
    return { moveId: data as unknown as string }
  },
  async revert(ctx, record) {
    const result = record.result as { moveId?: string } | null
    if (!result?.moveId) throw new ActionError("No stock move recorded to reverse", "forbidden")

    const { error } = await ctx.db.rpc("reverse_stock_move", { p_move: result.moveId })
    if (error) throw new ActionError(error.message, "execution_failed")
  },
})

export const recordQuickSale = defineAction({
  name: "record_quick_sale",
  description:
    "Record an over-the-counter sale of a single product without raising a sales order. " +
    "Use only for immediate cash sales; anything invoiced should go through create_sales_order.",
  defaultMode: "approve",
  schema: z.object({
    productId: z.uuid(),
    qty: z.number().positive(),
    batchId: z.uuid().nullable().optional(),
    unitPrice: z.number().min(0).nullable().optional(),
  }),
  risk: () => "medium",
  summarize: (i) => `Record sale of ${i.qty}`,
  revalidate: ["/inventory", "/sales", "/dashboard", "/scanner"],
  async amount(input, ctx) {
    if (input.unitPrice != null) return input.unitPrice * input.qty
    const product = await loadProduct(ctx, input.productId)
    return product.list_price * input.qty
  },
  async execute(ctx, input) {
    const product = await loadProduct(ctx, input.productId)

    // A batch-tracked product needs a lot; pick the earliest-expiring one with
    // stock so a counter sale does not require the operator to know lot codes.
    let batchId = input.batchId ?? null
    if (product.is_batch_tracked && !batchId) {
      const { data: batch } = await ctx.db
        .from("batches")
        .select("id")
        .eq("product_id", input.productId)
        .eq("org_id", ctx.orgId)
        .gt("qty_on_hand", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (!batch) throw new ActionError(`No stock available for ${product.sku}`, "execution_failed")
      batchId = batch.id
    }

    const unitPrice = input.unitPrice ?? product.list_price

    const { data, error } = await ctx.db.rpc("post_stock_move", {
      p_org: ctx.orgId,
      p_product: input.productId,
      p_direction: "out",
      p_qty: input.qty,
      p_reason: "sale",
      p_batch: batchId,
      p_unit_cost: unitPrice,
    })

    if (error) throw new ActionError(error.message, "execution_failed")
    return { moveId: data as unknown as string, unitPrice, total: unitPrice * input.qty }
  },
  async revert(ctx, record) {
    const result = record.result as { moveId?: string } | null
    if (!result?.moveId) throw new ActionError("No stock move recorded to reverse", "forbidden")

    const { error } = await ctx.db.rpc("reverse_stock_move", { p_move: result.moveId })
    if (error) throw new ActionError(error.message, "execution_failed")
  },
})

export const searchProducts = defineAction({
  name: "search_products",
  description:
    "Search the product catalog by name, SKU, or grade. Returns each match with its base unit, " +
    "density, available quantity, price, and package types. Use this to map a customer's wording " +
    "onto a catalog product before creating an order.",
  defaultMode: "auto",
  minRole: "viewer",
  schema: z.object({
    query: z.string().trim().min(1),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  risk: () => "low",
  summarize: (i) => `Search catalog for "${i.query}"`,
  async execute(ctx, input) {
    const pattern = `%${input.query.replace(/[%_]/g, "")}%`

    // Must be a single string literal: Supabase infers the result shape from
    // the literal type, and concatenation widens it to `string`, which drops
    // the inference entirely.
    const { data, error } = await ctx.db
      .from("products")
      .select(
        "id, sku, name, grade, concentration_pct, base_uom, density_kg_per_l, list_price, qty_on_hand, qty_reserved, is_batch_tracked, package_types(id, name, qty_per_package, uom), batches(id, lot_code, expiry_date, qty_on_hand, qty_reserved)"
      )
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .or(`name.ilike.${pattern},sku.ilike.${pattern},grade.ilike.${pattern}`)
      .limit(input.limit)

    if (error) throw new ActionError(error.message, "execution_failed")

    // For batch-tracked products the balance lives on the batches, not on the
    // product row — reporting products.qty_on_hand for those would tell the
    // agent every lot-tracked chemical is out of stock.
    const matches = (data ?? []).map((p) => {
      const batches = (p.batches ?? []) as {
        id: string
        lot_code: string
        expiry_date: string | null
        qty_on_hand: number
        qty_reserved: number
      }[]

      const available = p.is_batch_tracked
        ? batches.reduce((sum, b) => sum + (b.qty_on_hand - b.qty_reserved), 0)
        : p.qty_on_hand - p.qty_reserved

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        grade: p.grade,
        concentration_pct: p.concentration_pct,
        base_uom: p.base_uom,
        density_kg_per_l: p.density_kg_per_l,
        list_price: p.list_price,
        is_batch_tracked: p.is_batch_tracked,
        available,
        package_types: p.package_types,
        batches: p.is_batch_tracked
          ? batches
              .filter((b) => b.qty_on_hand > b.qty_reserved)
              .sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"))
          : [],
      }
    })

    return { matches }
  },
})
