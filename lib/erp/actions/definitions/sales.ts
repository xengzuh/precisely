import { z } from "zod"
import { recordAlias } from "@/lib/erp/aliases"
import { isoDate, uomSchema } from "@/lib/erp/schema"
import { roundMoney } from "@/lib/erp/uom"
import { defineAction } from "../define"
import { ActionError, type ActionContext } from "../types"

/**
 * A line as it arrives from a form or from document extraction.
 *
 * `productId` is nullable on purpose. When an agent cannot confidently map a
 * line to a catalog product it must record what the document actually said and
 * flag the line, rather than guess — in this industry a wrong product match is
 * a wrong chemical on a truck, not a typo.
 */
const orderLine = z.object({
  productId: z.uuid().nullable().optional(),
  descriptionRaw: z.string().trim().nullable().optional(),
  qty: z.number().positive(),
  uom: uomSchema.default("ea"),
  packageTypeId: z.uuid().nullable().optional(),
  packageCount: z.number().positive().nullable().optional(),
  unitPrice: z.number().min(0).default(0),
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
  needsReview: z.boolean().default(false),
  notes: z.string().trim().nullable().optional(),
})

function estimateTotal(lines: z.infer<typeof orderLine>[]): number {
  return roundMoney(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0))
}

async function orderTotal(ctx: ActionContext, orderId: string): Promise<number | null> {
  const { data } = await ctx.db
    .from("sales_orders")
    .select("total")
    .eq("id", orderId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  return data?.total ?? null
}

/**
 * Prove the order belongs to this org before handing its id to an RPC.
 *
 * allocate/fulfil/cancel/invoice all take only `p_order`. For a signed-in user
 * that is safe — the functions are SECURITY INVOKER, so RLS rejects another
 * org's row. Agent runs use the service role and have no RLS at all, so
 * without this check an order id from a neighbouring tenant would be honoured.
 */
async function assertOrderInOrg(ctx: ActionContext, orderId: string): Promise<void> {
  const { data, error } = await ctx.db
    .from("sales_orders")
    .select("id")
    .eq("id", orderId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (error) throw new ActionError(error.message, "execution_failed")
  if (!data) throw new ActionError("Sales order not found", "invalid_input")
}

export const createSalesOrder = defineAction({
  name: "create_sales_order",
  description:
    "Create a sales order with one or more lines. Quantities must be in the product's base unit " +
    "of measure — convert package counts (drums, IBCs, bags) and any mass/volume difference first. " +
    "Leave productId null and set needsReview when a line cannot be matched with confidence.",
  defaultMode: "approve",
  schema: z.object({
    customerId: z.uuid().nullable().optional(),
    customerRef: z.string().trim().nullable().optional(),
    requestedDate: isoDate.nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    source: z.enum(["manual", "agent", "import"]).default("manual"),
    lines: z.array(orderLine).min(1, "An order needs at least one line"),
  }),
  // An order nobody can identify a customer for, or with lines the extractor
  // was unsure about, always deserves eyes on it regardless of value.
  risk: (i) =>
    !i.customerId || i.lines.some((l) => !l.productId || l.needsReview) ? "high" : "low",
  amount: (i) => estimateTotal(i.lines),
  summarize: (i) => `Create sales order with ${i.lines.length} line(s), total ~${estimateTotal(i.lines)}`,
  revalidate: ["/orders", "/dashboard"],
  async execute(ctx, input) {
    const { data, error } = await ctx.db.rpc("create_sales_order", {
      p_org: ctx.orgId,
      p_header: {
        customer_id: input.customerId ?? null,
        customer_ref: input.customerRef ?? null,
        requested_date: input.requestedDate ?? null,
        notes: input.notes ?? null,
        source: input.source,
        status: "draft",
      },
      p_lines: input.lines.map((l) => ({
        product_id: l.productId ?? null,
        description_raw: l.descriptionRaw ?? null,
        qty: l.qty,
        uom: l.uom,
        package_type_id: l.packageTypeId ?? null,
        package_count: l.packageCount ?? null,
        unit_price: l.unitPrice,
        match_confidence: l.matchConfidence ?? null,
        needs_review: l.needsReview,
        notes: l.notes ?? null,
      })),
    })

    if (error) throw new ActionError(error.message, "execution_failed")
    return { orderId: data as unknown as string }
  },
  async revert(ctx, record) {
    const result = record.result as { orderId?: string } | null
    if (!result?.orderId) throw new ActionError("No order recorded to cancel", "forbidden")

    const { error } = await ctx.db.rpc("cancel_sales_order", { p_order: result.orderId })
    if (error) throw new ActionError(error.message, "execution_failed")
  },
})

export const confirmSalesOrder = defineAction({
  name: "confirm_sales_order",
  description:
    "Move a draft sales order to confirmed, meaning the customer's requirements are agreed. " +
    "Every line must be matched to a catalog product first.",
  defaultMode: "approve",
  schema: z.object({ orderId: z.uuid() }),
  risk: () => "medium",
  amount: (i, ctx) => orderTotal(ctx, i.orderId),
  summarize: () => "Confirm sales order",
  revalidate: ["/orders"],
  async execute(ctx, input) {
    const { count, error: countError } = await ctx.db
      .from("sales_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("order_id", input.orderId)
      .eq("org_id", ctx.orgId)
      .is("product_id", null)

    if (countError) throw new ActionError(countError.message, "execution_failed")
    if ((count ?? 0) > 0) {
      throw new ActionError(
        `${count} line(s) are not matched to a product — resolve them before confirming`,
        "invalid_input"
      )
    }

    const { error } = await ctx.db
      .from("sales_orders")
      .update({ status: "confirmed", needs_review: false })
      .eq("id", input.orderId)
      .eq("org_id", ctx.orgId)
      .eq("status", "draft")

    if (error) throw new ActionError(error.message, "execution_failed")
    return { orderId: input.orderId, status: "confirmed" }
  },
})

export const allocateSalesOrder = defineAction({
  name: "allocate_sales_order",
  description:
    "Reserve stock for a confirmed order. Lots are picked earliest-expiry-first (FEFO), which is " +
    "what customers expect for shelf-life-limited chemicals. Fails if stock is short.",
  defaultMode: "approve",
  schema: z.object({ orderId: z.uuid() }),
  risk: () => "medium",
  amount: (i, ctx) => orderTotal(ctx, i.orderId),
  summarize: () => "Reserve stock for sales order",
  revalidate: ["/orders", "/inventory"],
  async execute(ctx, input) {
    await assertOrderInOrg(ctx, input.orderId)

    const { error } = await ctx.db.rpc("allocate_sales_order", { p_order: input.orderId })
    if (error) throw new ActionError(error.message, "execution_failed")
    return { orderId: input.orderId, status: "allocated" }
  },
  async revert(ctx, record) {
    const result = record.result as { orderId?: string } | null
    if (!result?.orderId) throw new ActionError("No order recorded", "forbidden")

    await assertOrderInOrg(ctx, result.orderId)

    const { error } = await ctx.db.rpc("cancel_sales_order", { p_order: result.orderId })
    if (error) throw new ActionError(error.message, "execution_failed")
  },
})

export const fulfilSalesOrder = defineAction({
  name: "fulfil_sales_order",
  description:
    "Ship an allocated order: consume the reserved stock and write the movements to the ledger. " +
    "This physically commits the goods, so it is never automatic.",
  defaultMode: "approve",
  schema: z.object({ orderId: z.uuid() }),
  // Goods leaving the warehouse is the point of no easy return.
  risk: () => "high",
  amount: (i, ctx) => orderTotal(ctx, i.orderId),
  summarize: () => "Fulfil and ship sales order",
  revalidate: ["/orders", "/inventory", "/sales", "/dashboard"],
  async execute(ctx, input) {
    await assertOrderInOrg(ctx, input.orderId)

    const { error } = await ctx.db.rpc("fulfil_sales_order", { p_order: input.orderId })
    if (error) throw new ActionError(error.message, "execution_failed")
    return { orderId: input.orderId, status: "fulfilled" }
  },
})

export const cancelSalesOrder = defineAction({
  name: "cancel_sales_order",
  description: "Cancel a sales order and release any stock it was holding.",
  defaultMode: "approve",
  schema: z.object({ orderId: z.uuid(), reason: z.string().trim().optional() }),
  risk: () => "medium",
  summarize: (i) => `Cancel sales order${i.reason ? ` — ${i.reason}` : ""}`,
  revalidate: ["/orders", "/inventory"],
  async execute(ctx, input) {
    await assertOrderInOrg(ctx, input.orderId)

    const { error } = await ctx.db.rpc("cancel_sales_order", { p_order: input.orderId })
    if (error) throw new ActionError(error.message, "execution_failed")
    return { orderId: input.orderId, status: "cancelled" }
  },
})

export const updateSalesOrderLine = defineAction({
  name: "update_sales_order_line",
  description:
    "Correct one line of a draft sales order — match it to a catalog product, or fix the quantity " +
    "or unit price. Quantity must be in the product's base unit of measure. Use this to resolve " +
    "lines a document extraction could not match; it clears the review flag once a product is set.",
  defaultMode: "approve",
  schema: z.object({
    lineId: z.uuid(),
    productId: z.uuid().nullable().optional(),
    qty: z.number().positive().optional(),
    unitPrice: z.number().min(0).optional(),
    notes: z.string().trim().nullable().optional(),
  }),
  risk: () => "low",
  summarize: (i) => `Update sales order line${i.productId ? " and match it to a product" : ""}`,
  revalidate: ["/orders"],
  async execute(ctx, input) {
    const { data: line, error: readError } = await ctx.db
      .from("sales_order_lines")
      .select(
        "id, order_id, qty, unit_price, product_id, description_raw, package_type_id, sales_orders(status, customer_id)"
      )
      .eq("id", input.lineId)
      .eq("org_id", ctx.orgId)
      .maybeSingle()

    if (readError) throw new ActionError(readError.message, "execution_failed")
    if (!line) throw new ActionError("Line not found", "invalid_input")

    // Once stock is reserved against a line, changing its quantity would leave
    // the reservation and the order disagreeing. Cancel or re-allocate instead.
    if (line.sales_orders?.status !== "draft") {
      throw new ActionError(
        `Only draft orders can be edited (order is ${line.sales_orders?.status})`,
        "invalid_input"
      )
    }

    const qty = input.qty ?? line.qty
    const unitPrice = input.unitPrice ?? line.unit_price
    const productId = input.productId !== undefined ? input.productId : line.product_id

    const { error } = await ctx.db
      .from("sales_order_lines")
      .update({
        product_id: productId,
        qty,
        unit_price: unitPrice,
        line_total: roundMoney(qty * unitPrice),
        // A human picking the product is the review. An agent reaching this
        // path has already been through the approval gate.
        needs_review: productId ? false : true,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .eq("id", input.lineId)
      .eq("org_id", ctx.orgId)

    if (error) throw new ActionError(error.message, "execution_failed")

    const { error: totalsError } = await ctx.db.rpc("recalc_sales_order_totals", {
      p_order: line.order_id,
    })
    if (totalsError) throw new ActionError(totalsError.message, "execution_failed")

    // Learn from the correction. Only when a human is doing the resolving —
    // an agent recording its own guesses as facts would teach itself its
    // mistakes and make the next extraction worse, not better.
    if (productId && !line.product_id && ctx.actor === "user") {
      await recordAlias(ctx, {
        customerId: line.sales_orders?.customer_id ?? null,
        rawText: line.description_raw,
        productId,
        packageTypeId: line.package_type_id,
      })
    }

    return { lineId: input.lineId, orderId: line.order_id }
  },
})

export const createInvoice = defineAction({
  name: "create_invoice",
  description:
    "Raise a draft invoice from an allocated or fulfilled sales order, copying its lines and totals " +
    "and setting the due date from the customer's payment terms.",
  defaultMode: "approve",
  schema: z.object({ orderId: z.uuid() }),
  risk: () => "medium",
  amount: (i, ctx) => orderTotal(ctx, i.orderId),
  summarize: () => "Raise invoice from sales order",
  revalidate: ["/invoices", "/orders", "/dashboard"],
  async execute(ctx, input) {
    await assertOrderInOrg(ctx, input.orderId)

    const { data, error } = await ctx.db.rpc("create_invoice_from_order", {
      p_order: input.orderId,
    })
    if (error) throw new ActionError(error.message, "execution_failed")
    return { invoiceId: data as unknown as string }
  },
})

export const sendInvoice = defineAction({
  name: "send_invoice",
  description:
    "Mark a draft invoice as sent to the customer. Sending is outward-facing and cannot be " +
    "unsent, so it always requires a human.",
  defaultMode: "approve",
  minRole: "admin",
  schema: z.object({ invoiceId: z.uuid() }),
  risk: () => "high",
  summarize: () => "Send invoice to customer",
  revalidate: ["/invoices"],
  async execute(ctx, input) {
    const { error } = await ctx.db
      .from("invoices")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", input.invoiceId)
      .eq("org_id", ctx.orgId)
      .eq("status", "draft")

    if (error) throw new ActionError(error.message, "execution_failed")
    return { invoiceId: input.invoiceId, status: "sent" }
  },
})

export const recordInvoicePayment = defineAction({
  name: "record_invoice_payment",
  description:
    "Record money received against an invoice. Partial payments are allowed; the invoice is marked " +
    "paid automatically once the full amount is settled. Cannot exceed the outstanding balance.",
  defaultMode: "approve",
  minRole: "admin",
  schema: z.object({
    invoiceId: z.uuid(),
    amount: z.number().positive("A payment must be greater than zero"),
  }),
  // Money moving in the ledger is a claim about the real world that an agent
  // has no way to verify — it only ever sees a document saying so.
  risk: () => "high",
  amount: (i) => i.amount,
  summarize: (i) => `Record payment of ${i.amount} against invoice`,
  revalidate: ["/invoices", "/dashboard"],
  async execute(ctx, input) {
    // Guard the tenant boundary before calling the RPC: record_invoice_payment
    // takes only an invoice id, and on the agent path there is no RLS to catch
    // an id belonging to another org.
    const { data: invoice, error: readError } = await ctx.db
      .from("invoices")
      .select("id")
      .eq("id", input.invoiceId)
      .eq("org_id", ctx.orgId)
      .maybeSingle()

    if (readError) throw new ActionError(readError.message, "execution_failed")
    if (!invoice) throw new ActionError("Invoice not found", "invalid_input")

    const { data, error } = await ctx.db.rpc("record_invoice_payment", {
      p_invoice: input.invoiceId,
      p_amount: input.amount,
    })

    if (error) throw new ActionError(error.message, "execution_failed")
    return { invoiceId: input.invoiceId, amountPaid: data as unknown as number }
  },
})
