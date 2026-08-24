import { z } from "zod"
import { getWhatsAppProvider } from "@/lib/whatsapp"
import { defineAction } from "../define"
import { ActionError } from "../types"

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
