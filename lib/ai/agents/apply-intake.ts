import { createSalesOrder } from "@/lib/erp/actions/definitions/sales"
import { lookupAliases, normalizeAlias } from "@/lib/erp/aliases"
import { priceNote, resolveLinePrice } from "@/lib/erp/pricing"
import { runAction } from "@/lib/erp/actions/run"
import type { ActionContext } from "@/lib/erp/actions/types"
import { getServiceClient } from "@/lib/supabase/service"
import { extractPurchaseOrder, type IntakeInput, type PoExtraction } from "./po-intake"
import { withRun } from "../run"

/**
 * Read a document, then turn what it says into a draft sales order.
 *
 * The write goes through `runAction` like any other, so the order is audited
 * and — under the org's autonomy policy — usually queued for approval rather
 * than created outright. `createSalesOrder` classifies an order with unmatched
 * lines or no customer as high risk, which means exactly the documents that
 * need a human get one.
 */

export type IntakeOutcome = {
  documentId: string
  extraction: PoExtraction
  status: "created" | "pending_approval" | "failed"
  orderId: string | null
  actionId: string | null
  error: string | null
}

/** Lines the model matched to nothing, or matched with low confidence. */
function reviewCount(extraction: PoExtraction): number {
  return extraction.lines.filter((l) => !l.productId || l.needsReview).length
}

export async function processInboundDocument(
  ctx: ActionContext,
  documentId: string,
  input: IntakeInput
): Promise<IntakeOutcome> {
  const service = getServiceClient(ctx.orgId)

  await service.unsafe
    .from("inbound_documents")
    .update({ status: "parsing" })
    .eq("id", documentId)
    .eq("org_id", ctx.orgId)

  try {
    return await withRun(
      { orgId: ctx.orgId, agent: "po-intake", trigger: "manual", inputRef: documentId },
      async (runId) => {
        const { extraction, usage } = await extractPurchaseOrder(ctx, input)

        // Second pass over what the model left unmatched. An alias is a human's
        // recorded decision about this customer's wording, so it outranks the
        // model's uncertainty — and a line resolved here needs no review.
        if (extraction.customerId) {
          const unresolved = extraction.lines.filter((l) => !l.productId)
          if (unresolved.length > 0) {
            const aliases = await lookupAliases(
              ctx,
              extraction.customerId,
              unresolved.map((l) => l.descriptionRaw)
            )

            for (const line of unresolved) {
              const hit = aliases.get(normalizeAlias(line.descriptionRaw))
              if (!hit) continue

              line.productId = hit.productId
              line.packageTypeId = line.packageTypeId ?? hit.packageTypeId
              line.needsReview = false
              line.matchConfidence = 1
              line.notes = line.notes
                ? `${line.notes} (resolved from a previously recorded alias)`
                : "Resolved from a previously recorded alias"
            }
          }
        }

        // Price from the catalog where the document was silent. Done here
        // rather than by the model because a price is money: a deterministic
        // lookup cannot mis-transcribe a figure, and an invented one becomes
        // an invoice someone has to retract.
        const matched = extraction.lines
          .map((l) => l.productId)
          .filter((id): id is string => Boolean(id))

        const listPrices = new Map<string, number>()
        if (matched.length > 0) {
          const { data: priced } = await ctx.db
            .from("products")
            .select("id, list_price")
            .eq("org_id", ctx.orgId)
            .in("id", [...new Set(matched)])

          for (const p of priced ?? []) listPrices.set(p.id, p.list_price)
        }

        const pricedLines = extraction.lines.map((line) => {
          const { unitPrice, source } = resolveLinePrice({
            statedPrice: line.unitPrice,
            listPrice: line.productId ? listPrices.get(line.productId) : null,
          })
          const note = priceNote(source)

          return {
            line,
            unitPrice,
            // Surfaced to the reviewer: a price they will not find anywhere on
            // the customer's document should say where it came from.
            notes: note ? [line.notes, note].filter(Boolean).join(" · ") : line.notes,
            // Unpriced is not a guess to be trusted — someone has to set it.
            needsReview: line.needsReview || !line.productId || source === "unpriced",
          }
        })

        const outcome = await runAction(
          createSalesOrder,
          {
            customerId: extraction.customerId,
            customerRef: extraction.customerRef,
            requestedDate: extraction.requestedDate,
            source: "agent",
            notes: extraction.documentNotes,
            lines: pricedLines.map(({ line, unitPrice, notes, needsReview }) => ({
              productId: line.productId,
              descriptionRaw: line.descriptionRaw,
              qty: line.qty,
              uom: (line.uom === "kg" || line.uom === "L" ? line.uom : "ea") as "kg" | "L" | "ea",
              packageTypeId: line.packageTypeId,
              packageCount: line.packageCount,
              unitPrice,
              matchConfidence: line.matchConfidence,
              needsReview,
              notes,
            })),
          },
          { ...ctx, runId }
        )

        const orderId =
          outcome.status === "executed"
            ? ((outcome.result as { orderId?: string }).orderId ?? null)
            : null

        await service.unsafe
          .from("inbound_documents")
          .update({
            status: "applied",
            extracted: extraction as unknown as never,
            agent_run_id: runId,
            sales_order_id: orderId,
          })
          .eq("id", documentId)
          .eq("org_id", ctx.orgId)

        const result: IntakeOutcome = {
          documentId,
          extraction,
          status: outcome.status === "executed" ? "created" : "pending_approval",
          orderId,
          actionId: outcome.actionId,
          error: null,
        }

        return { result, usage }
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    await service.unsafe
      .from("inbound_documents")
      .update({ status: "failed", error: message.slice(0, 2000) })
      .eq("id", documentId)
      .eq("org_id", ctx.orgId)

    return {
      documentId,
      extraction: { customerId: null, customerNameRaw: null, customerRef: null, requestedDate: null, currency: null, lines: [], documentNotes: null },
      status: "failed",
      orderId: null,
      actionId: null,
      error: message,
    }
  }
}

export { reviewCount }
