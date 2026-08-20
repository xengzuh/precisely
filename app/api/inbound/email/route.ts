import { createHmac, timingSafeEqual } from "node:crypto"
import { processInboundDocument } from "@/lib/ai/agents/apply-intake"
import { hasApiKey } from "@/lib/ai/client"
import { getAgentContext } from "@/lib/erp/actions/context"
import { isLikelyOrderAttachment, stripQuotedReply } from "@/lib/erp/email"
import { findCustomerByEmail } from "@/lib/erp/queries"
import { getServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Inbound email → draft sales order.
 *
 * Same downstream path as the Inbox screen, so switching a real mailbox on is
 * configuration rather than a second implementation.
 *
 * Two things make this safe to expose publicly:
 *
 *  1. The body is HMAC-verified against a shared secret before it is read.
 *     Without that, anyone who finds the URL can inject orders.
 *  2. `org_id` comes from server configuration, never from the payload. This
 *     path runs on the service role with no RLS, so an org id taken from the
 *     request body would let a sender write into any tenant they can name.
 *
 * Because (2) reads a single env var, this handler is single-tenant as
 * written. Serving several orgs needs a per-org inbound address (a column on
 * `organizations`, matched against the recipient) — resolve the org from that
 * lookup, still never from the body.
 */

type InboundPayload = {
  from?: string
  subject?: string
  text?: string
  html?: string
  messageId?: string
  headers?: Record<string, string>
  attachments?: {
    name?: string
    contentType?: string
    contentId?: string
    size?: number
    content?: string
  }[]
}

/** Providers disagree on where the Message-ID lives; check both spellings. */
function messageIdOf(payload: InboundPayload): string | null {
  const raw =
    payload.messageId ??
    payload.headers?.["message-id"] ??
    payload.headers?.["Message-ID"] ??
    null
  return raw?.trim().replace(/^<|>$/g, "") || null
}

function verify(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const provided = signature.replace(/^sha256=/, "")

  // Lengths must match before timingSafeEqual, which throws on a mismatch —
  // and comparing with === would leak the answer one byte at a time.
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
}

export async function POST(request: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  const orgId = process.env.INBOUND_ORG_ID

  if (!secret || !orgId) {
    // Not an error the caller can fix — say so plainly rather than 500ing.
    return new Response(
      "Inbound email is not configured. Set INBOUND_WEBHOOK_SECRET and INBOUND_ORG_ID.",
      { status: 501 }
    )
  }
  if (!hasApiKey()) {
    return new Response("ANTHROPIC_API_KEY is not set", { status: 501 })
  }

  const rawBody = await request.text()

  if (!verify(rawBody, request.headers.get("x-webhook-signature"), secret)) {
    return new Response("Invalid signature", { status: 401 })
  }

  let payload: InboundPayload
  try {
    payload = JSON.parse(rawBody) as InboundPayload
  } catch {
    return new Response("Body is not valid JSON", { status: 400 })
  }

  // Signature logos, ISO certificates, and the customer's own terms all arrive
  // as attachments. Paying per-page image tokens to read a logo buys nothing.
  const pdf = (payload.attachments ?? []).find(isLikelyOrderAttachment)

  // Quoted history carries every previous order underneath this one. An
  // extractor handed the whole thread can confidently pull last month's PO.
  const text = stripQuotedReply(payload.text) || null

  if (!pdf?.content && !text) {
    return new Response("Nothing to read: no PDF attachment and no text body", { status: 400 })
  }

  try {
    const ctx = await getAgentContext(orgId, null)
    const service = getServiceClient(orgId)
    const messageId = messageIdOf(payload)

    // Idempotency. A 5xx makes the provider retry, and staff forward the same
    // PO to each other; both would otherwise create duplicate draft orders.
    if (messageId) {
      const { data: seen } = await service.unsafe
        .from("inbound_documents")
        .select("id, sales_order_id, status")
        .eq("org_id", orgId)
        .eq("message_id", messageId)
        .maybeSingle()

      if (seen) {
        return Response.json({
          documentId: seen.id,
          status: "duplicate",
          orderId: seen.sales_order_id,
        })
      }
    }

    // The sender's address is an exact fact; a company name in the body is an
    // inference. Resolving here also unlocks that customer's learned aliases,
    // which are scoped per customer and would otherwise never apply.
    const customer = await findCustomerByEmail(ctx, payload.from ?? null)

    const { data, error } = await service.unsafe
      .from("inbound_documents")
      .insert({
        org_id: orgId,
        source: "email",
        from_address: payload.from ?? null,
        subject: payload.subject ?? null,
        mime: pdf ? "application/pdf" : "text/plain",
        message_id: messageId,
        body_text: text,
        status: "received",
      })
      .select("id")
      .single()

    if (error) {
      // A concurrent delivery of the same message won the race to insert.
      if (error.code === "23505") {
        return Response.json({ status: "duplicate", documentId: null, orderId: null })
      }
      throw new Error(error.message)
    }

    const outcome = await processInboundDocument(ctx, data.id, {
      pdfBase64: pdf?.content ?? null,
      text,
      fromAddress: payload.from ?? null,
      subject: payload.subject ?? null,
      knownCustomer: customer ? { id: customer.id, name: customer.name } : null,
    })

    // 200 even on a failed extraction: the document was accepted and recorded,
    // and the failure is visible in the Inbox. A non-2xx would make the mail
    // provider retry a document that will fail identically every time.
    return Response.json({
      documentId: outcome.documentId,
      status: outcome.status,
      orderId: outcome.orderId,
    })
  } catch (err) {
    console.error("[inbound/email]", err)
    return new Response("Failed to process the message", { status: 500 })
  }
}
