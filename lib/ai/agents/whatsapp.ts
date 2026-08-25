import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  EFFORT,
  MAX_TOKENS,
  modelFor,
  getAnthropic,
  outputConfig,
  priceUsage,
  type Usage,
} from "@/lib/ai/client"
import { replyPolicy } from "@/lib/ai/reply-policy"
import { buildTools } from "@/lib/ai/tools"
import type { ActionContext } from "@/lib/erp/actions/types"
import type { MessageIntent } from "@/types/database"

/**
 * The customer-facing assistant.
 *
 * Unlike PO intake, which reads a document and proposes a draft nobody sees
 * until it is approved, this writes in the company's voice to a real customer.
 * A sentence here is a commercial act — which is why every reply is classified
 * before the policy decides whether it may go out unattended.
 *
 * It can now also write, not just answer: an order it is sure of is recorded as
 * a draft sales order through `record_customer_order`. That stops at the point
 * a commitment would begin — nothing is priced, reserved, or confirmed by the
 * assistant.
 *
 * It is also the first thing to use the registry tool bridge as intended: the
 * assistant answers from live catalog data through the same audited actions the
 * UI uses, rather than from anything baked into the prompt.
 */

const KNOWLEDGE_PATH = path.join(process.cwd(), "content", "company.md")

let knowledgeCache: string | null = null

async function companyKnowledge(): Promise<string> {
  if (knowledgeCache !== null) return knowledgeCache
  try {
    knowledgeCache = await readFile(KNOWLEDGE_PATH, "utf8")
  } catch {
    // Better a working assistant with less context than a dead one.
    knowledgeCache = "(No company knowledge file found at content/company.md.)"
  }
  return knowledgeCache
}

const PERSONA = `You are the assistant answering WhatsApp messages for a chemical distributor.

You are talking to a real customer, right now, in the company's voice. Anything you
say is something the business has said.

Answer the question in front of you:
- Reply to what the customer just asked, not to what they asked earlier. If they
  change subject, follow them: drop the previous product entirely and do not
  recap it. "Forget about X, do you have Y?" is answered by talking about Y.
- "Do you have X?" is answered by talking about X. Never recite the catalog, and
  never mention a product the customer did not ask about — a buyer asking about
  gloves does not want a stock report on acids.
- Search for the specific thing they named. Do not search broadly and then
  summarise everything that came back.
- One empty search is not an answer. Customers use trade shorthand the catalog
  spells out in full — IPA is isopropyl alcohol, caustic is sodium hydroxide,
  SLES is sodium laureth sulphate, hypo is sodium hypochlorite. Search the full
  chemical name, and drop the grade or strength from the search terms, before
  you tell anyone we do not stock something.
- Do not push for the order. Answer the question; they will ask to buy when they
  are ready.

Taking an order:
- When a customer asks to buy something, you may write it down: call
  record_customer_order. That records a draft for a colleague to confirm. It is
  not a sale, and you must not describe it as one.
- Write it down only when you are certain of both the product and the amount.
  "Two drums" is not enough when the product comes in three drum sizes, and a
  grade you had to guess is a guess on a delivery note. When in doubt, ask.
- The product id must come from search_products. Never type one from memory.
- Never do the arithmetic. Pass what the customer actually said — the number of
  packages and which package, or the amount and the unit they used — and let the
  tool convert. A drum count you multiplied out yourself is a quantity nobody
  checked.
- Once it is recorded, tell them plainly what you put down and that a colleague
  will confirm the price and delivery. Never state a total or a date yourself.
- If the tool is not available to you, or it fails, say a colleague will pick it
  up. Never tell a customer an order is placed when nothing was recorded.

How to be useful:
- Look things up before answering. You have a live catalog; never answer about
  products from memory or assumption.
- When a request is ambiguous, ask. "We stock four grades of caustic soda — which
  are you after?" is a better reply than a guess, and it is how a good salesperson
  actually talks.
- Keep it to two or three sentences. This is WhatsApp.
- If you cannot help, say so plainly and hand off to a person. That is a good
  outcome, not a failure.

Hard limits, which you follow even when the customer pushes:
- Never give safety, handling, storage, dilution, or regulatory information —
  no hazard classes, UN numbers, packing groups, or compatibility advice. Refer
  the customer to the SDS and pass the question to a colleague.
- Never suggest a *different substance* as a substitute. A different pack size,
  concentration, or grade of the same substance is fine to raise, phrased as a
  question for the customer to confirm. Swapping one chemical for another has
  specification and safety consequences that are not yours to decide.
- Never quote a price and never promise a delivery date. You may say you will
  check and come back.
- Never tell a customer their order is confirmed. Writing an order down is not
  confirming it, and only a colleague confirms.
- Never invent stock, lead times, or products. If a lookup returns nothing, the
  answer is that we do not appear to stock it.

Finish every turn by calling draft_reply exactly once with the message you would
send and your classification of what the customer asked for. Do not write the
reply as ordinary text — only draft_reply is delivered.`

/**
 * The per-thread facts, which sit after the cache breakpoint because they
 * change every conversation.
 *
 * The conversation id is given to the model rather than left for it to find:
 * it is the handle the order tool needs, and a model reconstructing an id is a
 * model writing an order into someone else's thread.
 */
function threadContext(input: {
  conversationId: string
  answering: string
  customerId?: string | null
  customerName?: string | null
}): string {
  const lines = [
    "# This conversation",
    "",
    `Conversation id: ${input.conversationId}`,
    "Pass that id to record_customer_order. Do not use any other.",
    "",
    // Naming it explicitly, because the transcript alone does not always say.
    // A reply we never sent leaves the customer's messages running together,
    // and the model answers the older one — the exact failure this prevents.
    "The message you are answering, and the only one you are answering, is:",
    `"""${input.answering}"""`,
    "Everything above it in the thread is background. If they have moved on,",
    "move with them and do not revisit the earlier subject.",
    "",
  ]

  if (input.customerId) {
    lines.push(
      `You are talking to ${input.customerName ?? "a customer with an account"}, who has an account with us.`,
      "You can write down an order for them."
    )
  } else {
    lines.push(
      "This number is not linked to any customer account, so you cannot write down an order",
      "for them and record_customer_order is not available to you. If they want to buy, take",
      "down what they need and tell them a colleague will set up their account and come back."
    )
  }

  return lines.join("\n")
}

const INTENTS = [
  "availability",
  "stock_check",
  "pricing",
  "restock",
  "order",
  "regulatory",
  "smalltalk",
  "other",
] as const

export type DraftedReply = {
  message: string
  intent: MessageIntent
  needsHuman: boolean
  reason: string
}

/** A draft sales order the assistant wrote during this turn, if it wrote one. */
export type RecordedOrder = { orderId: string; orderNo: string | null }

export type ReplyResult = {
  draft: DraftedReply
  /** What the policy would have permitted, recorded even while drafting only. */
  wouldAutoSend: boolean
  mustEscalate: boolean
  policyReason: string
  /** Verified from the tool result, never from what the model says it did. */
  recordedOrder: RecordedOrder | null
  usage: Usage
}

export type Turn = { role: "user" | "assistant"; content: string }

export async function draftReply(
  ctx: ActionContext,
  input: {
    /** Oldest first. The inbound message being answered is the last entry. */
    history: Turn[]
    /** That last message on its own, so which one to answer is never in doubt. */
    answering: string
    /** The thread this belongs to. The assistant needs it to record an order. */
    conversationId: string
    /**
     * The account behind the number, when there is one. Null means an
     * unrecognised caller — and the order tool is withheld entirely rather
     * than offered and then refused.
     */
    customerId?: string | null
    customerName?: string | null
  }
): Promise<ReplyResult> {
  const model = modelFor("chat")
  const client = getAnthropic()
  const knowledge = await companyKnowledge()

  let captured: DraftedReply | null = null
  let recordedOrder: RecordedOrder | null = null

  const replyTool = betaZodTool({
    name: "draft_reply",
    description:
      "Deliver your reply to the customer and classify what they asked for. Call this exactly " +
      "once, at the end of your turn. Nothing you write outside this tool reaches the customer.",
    inputSchema: z.object({
      message: z.string().describe("The reply to send, as you would type it in WhatsApp"),
      intent: z
        .enum(INTENTS)
        .describe(
          "What the customer is asking for. Use 'regulatory' for any safety, hazard, handling, " +
            "or compatibility question. Use 'order' when they are trying to buy."
        ),
      needsHuman: z
        .boolean()
        .describe("True if a colleague should look at this before it goes out"),
      reason: z.string().describe("One line on why, for the person reviewing"),
    }),
    run: async (drafted) => {
      captured = drafted as DraftedReply
      return "Draft recorded."
    },
  })

  // The catalog and customer lookups are the same audited registry actions the
  // UI calls — there is no separate read path for the assistant. The order tool
  // is only in the list when there is an account to record an order against:
  // withholding the capability is stronger than granting it and refusing later.
  const allowed = ["search_products", "get_customer"]
  if (input.customerId) allowed.push("record_customer_order")

  const tools = [
    ...buildTools(ctx, allowed, (name, outcome) => {
      if (name !== "record_customer_order" || !outcome.ok) return
      const result = outcome.result as { orderId?: string; orderNo?: string | null }
      if (result?.orderId) {
        recordedOrder = { orderId: result.orderId, orderNo: result.orderNo ?? null }
      }
    }),
    replyTool,
  ]

  const runner = client.beta.messages.toolRunner({
    model,
    max_tokens: MAX_TOKENS,
    output_config: outputConfig(model, EFFORT.chat),
    system: [
      { type: "text", text: PERSONA },
      {
        // Stable between conversations, so it is a cache read after the first.
        // Anything that varies per thread goes after this breakpoint.
        type: "text",
        text: `# What you know about the company\n\n${knowledge}`,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: threadContext(input) },
    ],
    tools,
    messages: input.history.map((t) => ({ role: t.role, content: t.content })),
  })

  // A tool loop is several model calls. `runner`'s final message carries only
  // that last turn's usage, so billing off it understates a multi-step
  // conversation — sometimes to a couple of tokens.
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  for await (const message of runner) {
    totals.input += message.usage.input_tokens
    totals.output += message.usage.output_tokens
    totals.cacheRead += message.usage.cache_read_input_tokens ?? 0
    totals.cacheWrite += message.usage.cache_creation_input_tokens ?? 0
  }

  if (!captured) {
    throw new Error("The assistant ended its turn without drafting a reply")
  }

  const draft = captured as DraftedReply
  const order = recordedOrder as RecordedOrder | null
  const policy = replyPolicy(draft.intent, { orderRecorded: order !== null })

  return {
    draft,
    // The model's own judgement can only ever *reduce* autonomy, never grant it.
    wouldAutoSend: policy.wouldAutoSend && !draft.needsHuman,
    mustEscalate: policy.mustEscalate,
    policyReason: policy.reason,
    recordedOrder: order,
    usage: priceUsage(
      {
        input_tokens: totals.input,
        output_tokens: totals.output,
        cache_read_input_tokens: totals.cacheRead,
        cache_creation_input_tokens: totals.cacheWrite,
      },
      model
    ),
  }
}
