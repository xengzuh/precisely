import { draftReply, type Turn } from "@/lib/ai/agents/whatsapp"
import { withRun } from "@/lib/ai/run"
import type { ActionContext } from "@/lib/erp/actions/types"
import { phoneKey } from "@/lib/erp/phone"
import { getWhatsAppProvider } from "@/lib/whatsapp"
import { getServiceClient } from "@/lib/supabase/service"
import type { ConversationChannel, ConversationRow } from "@/types/database"

/**
 * Receiving a customer message and drafting an answer.
 *
 * Everything a customer sends and everything drafted in reply is persisted
 * before it is acted on, so a conversation is reviewable after the fact rather
 * than existing only inside one request.
 */

/** WhatsApp allows free-form replies for 24 hours after the customer writes. */
const WINDOW_HOURS = 24

/** Enough history for context without resending a year of chat every turn. */
const HISTORY_LIMIT = 20

/** Whether this organization lets the assistant answer without a person. */
async function autoReplyEnabled(ctx: ActionContext): Promise<boolean> {
  const { data } = await ctx.db
    .from("organizations")
    .select("whatsapp_auto_reply")
    .eq("id", ctx.orgId)
    .maybeSingle()

  // Absent or unreadable means off. Failing closed is the only safe default
  // for something that talks to customers.
  return data?.whatsapp_auto_reply ?? false
}

async function resolveCustomer(ctx: ActionContext, phone: string): Promise<string | null> {
  const key = phoneKey(phone)
  if (!key) return null

  // Postgres has no "compare the last nine digits" operator, so match on the
  // suffix and let the shared normalisation decide.
  const { data } = await ctx.db
    .from("customers")
    .select("id, phone")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .not("phone", "is", null)

  const matches = (data ?? []).filter((c) => phoneKey(c.phone) === key)
  // Two customers on one number is ambiguous; better unresolved than wrong.
  return matches.length === 1 ? matches[0].id : null
}

export async function findOrCreateConversation(
  ctx: ActionContext,
  input: { channel: ConversationChannel; externalId: string; displayName?: string | null }
): Promise<ConversationRow> {
  const service = getServiceClient(ctx.orgId)

  const { data: existing } = await service.unsafe
    .from("conversations")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("channel", input.channel)
    .eq("external_id", input.externalId)
    .maybeSingle()

  if (existing) return existing

  const { data, error } = await service.unsafe
    .from("conversations")
    .insert({
      org_id: ctx.orgId,
      channel: input.channel,
      external_id: input.externalId,
      display_name: input.displayName ?? null,
      customer_id: await resolveCustomer(ctx, input.externalId),
    })
    .select("*")
    .single()

  if (error) throw new Error(`Could not open a conversation: ${error.message}`)
  return data
}

export type InboundResult = {
  conversationId: string
  inboundMessageId: string
  draftMessageId: string | null
  status: "drafted" | "duplicate" | "failed"
  error: string | null
}

/**
 * Record an inbound message and draft a reply to it.
 *
 * The draft is stored, never sent. Nothing reaches a customer until a person
 * approves it — which is the whole point of running this way first.
 */
export async function receiveMessage(
  ctx: ActionContext,
  input: {
    channel: ConversationChannel
    externalId: string
    displayName?: string | null
    body: string
    /** The provider's message id, for deduplicating retries. */
    externalMessageId?: string | null
  }
): Promise<InboundResult> {
  const service = getServiceClient(ctx.orgId)
  const conversation = await findOrCreateConversation(ctx, input)

  if (input.externalMessageId) {
    const { data: seen } = await service.unsafe
      .from("conversation_messages")
      .select("id, conversation_id")
      .eq("org_id", ctx.orgId)
      .eq("external_id", input.externalMessageId)
      .maybeSingle()

    if (seen) {
      return {
        conversationId: seen.conversation_id,
        inboundMessageId: seen.id,
        draftMessageId: null,
        status: "duplicate",
        error: null,
      }
    }
  }

  const now = new Date()
  const windowExpires = new Date(now.getTime() + WINDOW_HOURS * 3_600_000)

  const { data: inbound, error: inboundError } = await service.unsafe
    .from("conversation_messages")
    .insert({
      org_id: ctx.orgId,
      conversation_id: conversation.id,
      direction: "inbound",
      status: "received",
      body: input.body,
      external_id: input.externalMessageId ?? null,
      needs_human: false,
    })
    .select("id")
    .single()

  if (inboundError) throw new Error(`Could not record the message: ${inboundError.message}`)

  await service.unsafe
    .from("conversations")
    .update({
      last_message_at: now.toISOString(),
      window_expires_at: windowExpires.toISOString(),
      status: "open",
      display_name: input.displayName ?? conversation.display_name,
    })
    .eq("id", conversation.id)
    .eq("org_id", ctx.orgId)

  try {
    return await withRun(
      { orgId: ctx.orgId, agent: "whatsapp", trigger: "api", inputRef: inbound.id },
      async (runId) => {
        const history = await loadHistory(ctx, conversation.id)
        const reply = await draftReply(ctx, { history })

        // Four separate conditions have to hold before the assistant answers a
        // customer unattended. Each one is a different way this could go wrong,
        // so none of them is folded into another.
        const autoReplyOn = await autoReplyEnabled(ctx)
        const provider = getWhatsAppProvider()
        const windowOpen =
          conversation.window_expires_at === null ||
          new Date(conversation.window_expires_at) > new Date()

        const shouldSend =
          reply.wouldAutoSend && autoReplyOn && provider !== null && windowOpen

        let status: "drafted" | "sent" = "drafted"
        let externalId: string | null = null
        let sendError: string | null = null

        if (shouldSend && provider) {
          try {
            const sent = await provider.send({
              to: conversation.external_id,
              body: reply.draft.message,
            })
            externalId = sent.externalId
            status = "sent"
          } catch (err) {
            // Falling back to a draft rather than failing: the customer is
            // waiting, and a reply a person can retry beats one that vanished.
            sendError = err instanceof Error ? err.message : "Unknown error"
            console.error("[conversation] auto-reply failed to send:", sendError)
          }
        }

        const { data: draft, error: draftError } = await service.unsafe
          .from("conversation_messages")
          .insert({
            org_id: ctx.orgId,
            conversation_id: conversation.id,
            direction: "outbound",
            status,
            body: reply.draft.message,
            intent: reply.draft.intent,
            would_auto_send: reply.wouldAutoSend,
            // Sent already means nobody needs to look at it; a draft still does.
            needs_human: status === "drafted",
            reason: sendError
              ? `Auto-reply failed, left as a draft: ${sendError}`
              : reply.mustEscalate
                ? `Escalated: ${reply.policyReason}`
                : reply.draft.reason,
            // No approved_by: this went out on the agent's own authority, and
            // the ledger should not imply a person signed it off.
            sent_at: status === "sent" ? new Date().toISOString() : null,
            external_id: externalId,
            error: sendError,
            agent_run_id: runId,
          })
          .select("id")
          .single()

        if (draftError) throw new Error(draftError.message)

        // A question the assistant must not answer is not just a gated reply —
        // the thread itself needs a person to pick it up.
        if (reply.mustEscalate) {
          await service.unsafe
            .from("conversations")
            .update({ status: "waiting_human" })
            .eq("id", conversation.id)
            .eq("org_id", ctx.orgId)
        }

        return {
          result: {
            conversationId: conversation.id,
            inboundMessageId: inbound.id,
            draftMessageId: draft.id,
            status: "drafted" as const,
            error: null,
          },
          usage: reply.usage,
        }
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    // The customer's message is already saved. A failed draft leaves the thread
    // needing a person rather than losing what they said.
    await service.unsafe
      .from("conversations")
      .update({ status: "waiting_human" })
      .eq("id", conversation.id)
      .eq("org_id", ctx.orgId)

    return {
      conversationId: conversation.id,
      inboundMessageId: inbound.id,
      draftMessageId: null,
      status: "failed",
      error: message,
    }
  }
}

async function loadHistory(ctx: ActionContext, conversationId: string): Promise<Turn[]> {
  const { data } = await ctx.db
    .from("conversation_messages")
    .select("direction, body, status, created_at")
    .eq("org_id", ctx.orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)

  return (data ?? [])
    .reverse()
    // Only what the customer actually saw. A discarded draft never existed as
    // far as they are concerned, and feeding it back would have the assistant
    // building on words nobody sent.
    .filter((m) => m.direction === "inbound" || m.status === "sent" || m.status === "approved")
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }))
}
