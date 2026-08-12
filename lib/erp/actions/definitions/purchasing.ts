import { z } from "zod"
import { isoDate, uomSchema } from "@/lib/erp/schema"
import { roundMoney } from "@/lib/erp/uom"
import { defineAction } from "../define"
import { ActionError, type ActionContext } from "../types"

const purchaseLine = z.object({
  productId: z.uuid(),
  qty: z.number().positive(),
  uom: uomSchema.default("ea"),
  packageTypeId: z.uuid().nullable().optional(),
  unitCost: z.number().min(0).default(0),
  lotCode: z.string().trim().nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
})

async function purchaseOrderTotal(ctx: ActionContext, orderId: string): Promise<number | null> {
  const { data } = await ctx.db
    .from("purchase_orders")
    .select("total")
    .eq("id", orderId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  return data?.total ?? null
}

export const createPurchaseOrder = defineAction({
  name: "create_purchase_order",
  description:
    "Raise a purchase order to a supplier. Quantities are in each product's base unit of measure. " +
    "Supply lotCode and expiryDate when the supplier has already confirmed them.",
  defaultMode: "approve",
  schema: z.object({
    supplierId: z.uuid(),
    expectedDate: isoDate.nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    source: z.enum(["manual", "agent", "import"]).default("manual"),
    lines: z.array(purchaseLine).min(1, "A purchase order needs at least one line"),
  }),
  risk: () => "medium",
  amount: (i) => roundMoney(i.lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0)),
  summarize: (i) =>
    `Purchase order with ${i.lines.length} line(s), total ~${roundMoney(
      i.lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0)
    )}`,
  revalidate: ["/purchase-orders", "/dashboard"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.rpc("create_purchase_order", {
      p_org: ctx.orgId,
      p_header: {
        supplier_id: input.supplierId,
        expected_date: input.expectedDate ?? null,
        notes: input.notes ?? null,
        source: input.source,
        status: "ordered",
      },
      p_lines: input.lines.map((l) => ({
        product_id: l.productId,
        qty: l.qty,
        uom: l.uom,
        package_type_id: l.packageTypeId ?? null,
        unit_cost: l.unitCost,
        lot_code: l.lotCode ?? null,
        expiry_date: l.expiryDate ?? null,
      })),
    })

    if (error) throw new ActionError(error.message, "execution_failed")
    return { orderId: data as unknown as string }
  },
  async revert(ctx, record) {
    const result = record.result as { orderId?: string } | null
    if (!result?.orderId) throw new ActionError("No purchase order recorded", "forbidden")

    const { error } = await ctx.db
      .from("purchase_orders")
      .update({ status: "cancelled" })
      .eq("id", result.orderId)
      .eq("org_id", ctx.orgId)
      .neq("status", "received")

    if (error) throw new ActionError(error.message, "execution_failed")
  },
})

export const receivePurchaseOrder = defineAction({
  name: "receive_purchase_order",
  description:
    "Book in a purchase order: add the goods to stock, create batches from the lot codes, and " +
    "update each product's cost price to what was actually paid.",
  defaultMode: "approve",
  schema: z.object({ orderId: z.uuid() }),
  risk: () => "medium",
  amount: (i, ctx) => purchaseOrderTotal(ctx, i.orderId),
  summarize: () => "Receive purchase order into stock",
  revalidate: ["/purchase-orders", "/inventory", "/dashboard"],
  async execute(ctx, input) {
    const { error } = await ctx.db.rpc("receive_purchase_order", { p_order: input.orderId })
    if (error) throw new ActionError(error.message, "execution_failed")
    return { orderId: input.orderId, status: "received" }
  },
  async revert(ctx, record) {
    const result = record.result as { orderId?: string } | null
    if (!result?.orderId) throw new ActionError("No purchase order recorded", "forbidden")

    // Reverse each goods-in movement this receipt produced, then reopen the
    // order. Reversal posts inverse rows rather than deleting, so the ledger
    // keeps the full story: received, then unreceived.
    const { data: moves, error: movesError } = await ctx.db
      .from("stock_moves")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("ref_type", "purchase_order")
      .eq("ref_id", result.orderId)
      .eq("reason", "purchase")

    if (movesError) throw new ActionError(movesError.message, "execution_failed")

    for (const move of moves ?? []) {
      const { error } = await ctx.db.rpc("reverse_stock_move", { p_move: move.id })
      if (error) throw new ActionError(error.message, "execution_failed")
    }

    await ctx.db
      .from("purchase_orders")
      .update({ status: "ordered" })
      .eq("id", result.orderId)
      .eq("org_id", ctx.orgId)

    await ctx.db
      .from("purchase_order_lines")
      .update({ qty_received: 0 })
      .eq("order_id", result.orderId)
  },
})
