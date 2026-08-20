"use server"

import { revalidatePath } from "next/cache"
import { processInboundDocument, type IntakeOutcome } from "@/lib/ai/agents/apply-intake"
import { hasApiKey } from "@/lib/ai/client"
import { getUserContext } from "@/lib/erp/actions/context"
import { stripQuotedReply } from "@/lib/erp/email"
import { findCustomerByEmail } from "@/lib/erp/queries"
import { getServiceClient } from "@/lib/supabase/service"

/** 8 MB — comfortably above a scanned multi-page PO, below the API's 32 MB request cap. */
const MAX_PDF_BYTES = 8 * 1024 * 1024

/**
 * Accept a document and run the intake agent over it.
 *
 * The user-triggered half of PO intake. The webhook at
 * app/api/inbound/email/route.ts lands in the same place, so wiring up a real
 * mailbox later is configuration rather than a second implementation.
 */
export async function submitDocument(formData: FormData): Promise<IntakeOutcome> {
  if (!hasApiKey()) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to .env.local before running the intake agent"
    )
  }

  const ctx = await getUserContext()

  const file = formData.get("file")
  // Text pasted from a mail client carries the same quoted history a webhook
  // delivery does, and the same risk of extracting a previous order from it.
  const text = stripQuotedReply(formData.get("text") as string | null) || null
  const fromAddress = (formData.get("fromAddress") as string | null)?.trim() || null
  const subject = (formData.get("subject") as string | null)?.trim() || null

  let pdfBase64: string | null = null
  let mime: string | null = null

  if (file instanceof File && file.size > 0) {
    if (file.type !== "application/pdf") {
      throw new Error("Only PDF documents can be uploaded — paste the text for other formats")
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 8 MB`)
    }
    pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64")
    mime = file.type
  }

  if (!pdfBase64 && !text) {
    throw new Error("Attach a PDF or paste the order text")
  }

  const service = getServiceClient(ctx.orgId)

  const { data, error } = await service.unsafe
    .from("inbound_documents")
    .insert({
      org_id: ctx.orgId,
      source: "upload",
      from_address: fromAddress,
      subject,
      mime,
      // The PDF itself is not persisted here — only what the agent extracted
      // from it. Storing customer documents is a retention decision the
      // business should make deliberately, not a side effect of this feature.
      body_text: text,
      status: "received",
      created_by: ctx.userId,
    })
    .select("id")
    .single()

  if (error) throw new Error(`Could not record the document: ${error.message}`)

  // Same deterministic resolution as the webhook: if whoever pasted this filled
  // in a From address that matches a customer on file, that settles who the
  // order is for and makes their learned aliases apply.
  const customer = await findCustomerByEmail(ctx, fromAddress)

  const outcome = await processInboundDocument(ctx, data.id, {
    pdfBase64,
    text,
    fromAddress,
    subject,
    knownCustomer: customer ? { id: customer.id, name: customer.name } : null,
  })

  revalidatePath("/inbox")
  revalidatePath("/orders")
  revalidatePath("/agents")

  return outcome
}
