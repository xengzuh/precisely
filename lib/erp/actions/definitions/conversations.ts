import { z } from "zod"
import { priceNote, resolveLinePrice } from "@/lib/erp/pricing"
import { isoDate, uomSchema } from "@/lib/erp/schema"
import { formatQty, resolveToBase, roundMoney, UomError } from "@/lib/erp/uom"
import { getWhatsAppProvider } from "@/lib/whatsapp"
import type { Uom } from "@/types/database"
import { defineAction } from "../define"
import { ActionError, type ActionContext } from "../types"
import { createSalesOrder } from "./sales"

/**
 * Approving what the business says to a customer.
 *
 * These are registry actions rather than plain server actions because sending
 * a message is outward-facing and cannot be unsent — it belongs in the audit
 * trail beside every other write. It also means that when auto-send is
 * eventually switched on, the agent goes through the same gate a person does,
 * with no second code path to secure.
 */

export const sendCustomerMessage = defineAction({
  name: "send_customer_message",
  description:
    "Send a drafted reply to a customer. Optionally replace the text first. Sending is " +
    "outward-facing and cannot be undone.",
  defaultMode: "approve",
  schema: z.object({
    messageId: z.uuid(),
    /** An edited version of the draft. Omit to send it unchanged. */
    body: z.string().trim().min(1).optional(),
  }),
  risk: () => "high",
  summarize: () => "Send a reply to a customer",
  revalidate: ["/conversations"],
  async execute(ctx, input) {
    const { data: message, error: readError } = await ctx.db
      .from("conversation_messages")
      .select("id, conversation_id, status, direction, body, conversations(window_expires_at)")
      .eq("id", input.messageId)
      .eq("org_id", ctx.orgId)
      .maybeSingle()

    if (readError) throw new ActionError(readError.message, "execution_failed")
    if (!message) throw new ActionError("Message not found", "invalid_input")
    if (message.direction !== "outbound") {
      throw new ActionError("That is a message from the customer", "invalid_input")
    }
    if (message.status !== "drafted") {
      throw new ActionError(`This draft is already ${message.status}`, "invalid_input")
    }

    // WhatsApp only accepts a free-form reply within 24 hours of the customer's
    // last message. Past that it needs a pre-approved template, so sending now
    // would fail at the provider rather than here.
    const expires = message.conversations?.window_expires_at
    if (expires && new Date(expires) < new Date()) {
      throw new ActionError(
        "The 24-hour reply window has closed — this needs an approved template instead",
        "invalid_input"
      )
    }

    const body = input.body ?? message.body
    const provider = getWhatsAppProvider()

    // Without a channel, approval is as far as this goes, and the distinction
    // stays honest: a person said yes, but nothing has left the building. The
    // reviewer copies it across by hand.
    if (!provider) {
      const { error } = await ctx.db
        .from("conversation_messages")
        .update({
          body,
          status: "approved",
          needs_human: false,
          approved_by: ctx.userId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", input.messageId)
        .eq("org_id", ctx.orgId)

      if (error) throw new ActionError(error.message, "execution_failed")
      return { messageId: input.messageId, status: "approved", body, delivered: false }
    }

    const { data: thread } = await ctx.db
      .from("conversations")
      .select("external_id")
      .eq("id", message.conversation_id)
      .eq("org_id", ctx.orgId)
      .single()

    if (!thread) throw new ActionError("Conversation not found", "invalid_input")

    let externalId: string | null = null
    try {
      const sent = await provider.send({ to: thread.external_id, body })
      externalId = sent.externalId
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error"

      // Record the failure against the message rather than losing it — the
      // reviewer needs to know it did not go out, and why.
      await ctx.db
        .from("conversation_messages")
        .update({ status: "failed", error: reason.slice(0, 2000) })
        .eq("id", input.messageId)
        .eq("org_id", ctx.orgId)

      throw new ActionError(`Could not deliver the message: ${reason}`, "execution_failed")
    }

    const { error } = await ctx.db
      .from("conversation_messages")
      .update({
        body,
        status: "sent",
        needs_human: false,
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        external_id: externalId,
        error: null,
      })
      .eq("id", input.messageId)
      .eq("org_id", ctx.orgId)

    if (error) throw new ActionError(error.message, "execution_failed")

    return { messageId: input.messageId, status: "sent", body, delivered: true }
  },
})

export const discardCustomerMessage = defineAction({
  name: "discard_customer_message",
  description: "Discard a drafted reply without sending it.",
  defaultMode: "approve",
  schema: z.object({
    messageId: z.uuid(),
    reason: z.string().trim().optional(),
  }),
  risk: () => "low",
  summarize: (i) => `Discard a draft reply${i.reason ? ` — ${i.reason}` : ""}`,
  revalidate: ["/conversations"],
  async execute(ctx, input) {
    const { error } = await ctx.db
      .from("conversation_messages")
      .update({
        status: "discarded",
        needs_human: false,
        reason: input.reason ?? null,
      })
      .eq("id", input.messageId)
      .eq("org_id", ctx.orgId)
      .eq("status", "drafted")

    if (error) throw new ActionError(error.message, "execution_failed")
    return { messageId: input.messageId, status: "discarded" }
  },
})

/**
 * Taking an order over chat.
 *
 * This is deliberately a separate action from `create_sales_order` rather than
 * a reuse of it, for one reason: it needs its own policy key. "The chat
 * assistant may take orders" and "document intake may create orders" are
 * different decisions with different exposure, and an operator has to be able
 * to switch one on without the other.
 *
 * What it records is a *draft*. No stock is reserved, no price is agreed, and
 * nothing is promised — a colleague confirms the order in the normal way. That
 * is what makes it safe to run unattended: the assistant writes down what the
 * customer asked for, which is a clerical act, and stops short of the
 * commercial one.
 *
 * Two things the model is structurally prevented from doing here:
 *   - Pricing. There is no unitPrice in the schema, so a price can only come
 *     from the catalog, through the same deterministic lookup document intake
 *     uses.
 *   - Arithmetic. It passes the customer's own words — three drums, or 500 kg —
 *     and `resolveToBase` does the conversion, refusing rather than guessing
 *     when a product has no density.
 */

const orderRequestLine = z.object({
  productId: z
    .uuid()
    .describe("Catalog product id, taken from search_products. Never invent or guess one."),
  packageTypeId: z
    .uuid()
    .nullable()
    .optional()
    .describe("Which package the customer is ordering in, from that product's package_types"),
  packageCount: z
    .number()
    .positive()
    .nullable()
    .optional()
    .describe("How many of that package, e.g. 3 for 'three drums'. Use with packageTypeId."),
  qty: z
    .number()
    .positive()
    .nullable()
    .optional()
    .describe("A bulk amount, when the customer named a quantity rather than a package count"),
  uom: uomSchema
    .nullable()
    .optional()
    .describe("The unit the customer used for qty: kg, L, or ea. Do not convert it yourself."),
  note: z
    .string()
    .trim()
    .nullable()
    .optional()
    .describe("Anything about this line a colleague should see, in the customer's own words"),
})

type OrderRequestLine = z.infer<typeof orderRequestLine>

type ResolvedLine = {
  productId: string
  name: string
  /** In the product's base unit, whatever unit the customer used. */
  qty: number
  uom: Uom
  packageTypeId: string | null
  packageCount: number | null
  unitPrice: number
  needsReview: boolean
  /** How the customer expressed it, kept verbatim on the line. */
  describedAs: string
  notes: string | null
}

/**
 * Turn what the customer said into catalog lines: real products, quantities in
 * base units, and catalog prices.
 *
 * Every failure here is loud. A line the assistant cannot resolve is not a line
 * worth writing down badly — over chat it can simply ask, which is this
 * channel's whole advantage over a PDF.
 */
async function resolveOrderLines(
  ctx: ActionContext,
  lines: OrderRequestLine[]
): Promise<ResolvedLine[]> {
  const ids = [...new Set(lines.map((l) => l.productId))]

  // Single literal: see the note in products.ts searchProducts.
  const { data, error } = await ctx.db
    .from("products")
    .select("id, name, base_uom, density_kg_per_l, list_price, is_active, package_types(id, name, qty_per_package, uom)")
    .eq("org_id", ctx.orgId)
    .in("id", ids)

  if (error) throw new ActionError(error.message, "execution_failed")

  const catalog = new Map((data ?? []).map((p) => [p.id, p]))

  return lines.map((line, index) => {
    const at = `Line ${index + 1}`
    const product = catalog.get(line.productId)

    if (!product) {
      throw new ActionError(`${at}: no such product in this catalog`, "invalid_input")
    }
    if (!product.is_active) {
      throw new ActionError(`${at}: ${product.name} is no longer stocked`, "invalid_input")
    }

    const packages = product.package_types ?? []
    const pkg = line.packageTypeId ? packages.find((p) => p.id === line.packageTypeId) : null

    if (line.packageTypeId && !pkg) {
      throw new ActionError(
        `${at}: that package does not belong to ${product.name}`,
        "invalid_input"
      )
    }

    const usingPackages = pkg != null && line.packageCount != null
    if (!usingPackages && line.qty == null) {
      throw new ActionError(
        `${at}: say how much, either packageTypeId with packageCount, or qty with uom`,
        "invalid_input"
      )
    }

    let qty: number
    try {
      qty = resolveToBase(
        {
          qty: line.qty ?? 0,
          uom: line.uom ?? null,
          packageCount: usingPackages ? line.packageCount : null,
        },
        product,
        pkg
      )
    } catch (err) {
      // A missing density is a real answer, not a failure to try: this product
      // cannot be ordered in that unit, and the customer has to be asked for
      // the other one.
      if (err instanceof UomError) throw new ActionError(`${at}: ${err.message}`, "invalid_input")
      throw err
    }

    const { unitPrice, source } = resolveLinePrice({
      statedPrice: null,
      listPrice: product.list_price,
    })
    const note = priceNote(source)

    const describedAs =
      usingPackages && pkg
        ? `${line.packageCount} x ${pkg.name}`
        : `${line.qty} ${line.uom ?? product.base_uom}`

    return {
      productId: product.id,
      name: product.name,
      qty,
      uom: product.base_uom,
      packageTypeId: pkg?.id ?? null,
      packageCount: usingPackages ? (line.packageCount ?? null) : null,
      unitPrice,
      // A line nobody has priced is not ready to confirm, whatever else is right.
      needsReview: source === "unpriced",
      describedAs,
      notes: [line.note, `Customer asked for ${describedAs}`, note].filter(Boolean).join(" - "),
    }
  })
}

export const recordCustomerOrder = defineAction({
  name: "record_customer_order",
  description:
    "Write down what a customer in this conversation has asked to buy, as a draft sales order. " +
    "Give the quantity the way the customer said it: a number of packages (packageTypeId with " +
    "packageCount), or an amount with its unit (qty with uom). Never convert between units or " +
    "package sizes yourself; this does that. Prices come from the catalog, never from you. " +
    "The result is a draft only. It reserves no stock and agrees no price or delivery date, and " +
    "a colleague confirms it. Only call this once you are certain which catalog product and how " +
    "much; if there is any doubt, ask the customer instead.",
  // The one action here meant to run unattended. Recording what a customer
  // asked for is clerical and fully reversible; confirming, pricing,
  // allocating, and shipping it stay separate actions that a person does.
  defaultMode: "auto",
  schema: z.object({
    conversationId: z.uuid().describe("The conversation this order came from"),
    lines: z.array(orderRequestLine).min(1, "An order needs at least one line"),
    requestedDate: isoDate
      .nullable()
      .optional()
      .describe("A delivery date the customer asked for. Recording it is not agreeing to it."),
    notes: z
      .string()
      .trim()
      .nullable()
      .optional()
      .describe("Context for the colleague who will confirm this"),
  }),
  // Not high: nothing moves and nothing is promised. Value is what decides
  // whether a person sees it first, through the org's threshold.
  risk: () => "low",
  async amount(input, ctx) {
    try {
      const lines = await resolveOrderLines(ctx, input.lines)
      return roundMoney(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0))
    } catch {
      // Not valuable enough to fail the whole action over — execute is about to
      // throw the same error with the reason attached.
      return null
    }
  },
  summarize: (i) => `Record a customer order from a chat conversation (${i.lines.length} line(s))`,
  revalidate: ["/orders", "/dashboard", "/conversations"],
  async execute(ctx, input) {
    const { data: conversation, error } = await ctx.db
      .from("conversations")
      .select("id, customer_id, external_id, display_name, customers(name)")
      .eq("id", input.conversationId)
      .eq("org_id", ctx.orgId)
      .maybeSingle()

    if (error) throw new ActionError(error.message, "execution_failed")
    if (!conversation) throw new ActionError("Conversation not found", "invalid_input")

    // An order has to belong to somebody. An unrecognised number is not a
    // customer account, and inventing one from a chat message is how a
    // distributor ships chemicals to an address nobody vetted.
    if (!conversation.customer_id) {
      throw new ActionError(
        "This number is not linked to a customer account, so no order can be recorded against it",
        "invalid_input"
      )
    }

    const lines = await resolveOrderLines(ctx, input.lines)

    const who = conversation.display_name ?? conversation.external_id
    const provenance =
      `Taken over chat from ${who}. Draft only - price and delivery not agreed with the customer.`

    // Reuse create_sales_order's own execute rather than calling the RPC again:
    // one place builds that payload. Calling `execute` and not `runAction` is
    // deliberate too, so this stays one audited action rather than two nested.
    const { orderId } = await createSalesOrder.execute(ctx, {
      customerId: conversation.customer_id,
      customerRef: null,
      requestedDate: input.requestedDate ?? null,
      notes: [provenance, input.notes].filter(Boolean).join("\n"),
      source: "agent",
      lines: lines.map((l) => ({
        productId: l.productId,
        descriptionRaw: l.describedAs,
        qty: l.qty,
        uom: l.uom,
        packageTypeId: l.packageTypeId,
        packageCount: l.packageCount,
        unitPrice: l.unitPrice,
        matchConfidence: 1,
        needsReview: l.needsReview,
        notes: l.notes,
      })),
    })

    const { data: order } = await ctx.db
      .from("sales_orders")
      .select("order_no")
      .eq("id", orderId)
      .eq("org_id", ctx.orgId)
      .maybeSingle()

    return {
      orderId,
      orderNo: order?.order_no ?? null,
      status: "draft" as const,
      customer: conversation.customers?.name ?? null,
      lines: lines.map((l) => ({
        product: l.name,
        askedFor: l.describedAs,
        recorded: formatQty(l.qty, l.uom),
      })),
      // Read by the model as it writes the reply. Recorded is not confirmed,
      // and that distinction is the whole safety of this action, so it is
      // restated at the moment the model describes it to a customer.
      tellTheCustomer:
        "This is written down, not confirmed. Say that a colleague will confirm the price and " +
        "delivery. Do not quote a total and do not state a delivery date.",
    }
  },
  async revert(ctx, record) {
    const result = record.result as { orderId?: string } | null
    if (!result?.orderId) throw new ActionError("No order recorded to cancel", "forbidden")

    // The RPC takes only an order id, and there is no RLS on the agent path.
    const { data: owned, error: readError } = await ctx.db
      .from("sales_orders")
      .select("id")
      .eq("id", result.orderId)
      .eq("org_id", ctx.orgId)
      .maybeSingle()

    if (readError) throw new ActionError(readError.message, "execution_failed")
    if (!owned) throw new ActionError("Sales order not found", "invalid_input")

    const { error } = await ctx.db.rpc("cancel_sales_order", { p_order: result.orderId })
    if (error) throw new ActionError(error.message, "execution_failed")
  },
})
