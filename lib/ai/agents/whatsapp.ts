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
 * and, for now, drafted rather than sent.
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
- Do not push for the order. Answer the question; they will ask to buy when they
  are ready.

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
- Never quote a price, promise a delivery date, or confirm an order. You may say
  you will check and come back.
- Never invent stock, lead times, or products. If a lookup returns nothing, the
  answer is that we do not appear to stock it.

Finish every turn by calling draft_reply exactly once with the message you would
send and your classification of what the customer asked for. Do not write the
reply as ordinary text — only draft_reply is delivered.`

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

export type ReplyResult = {
  draft: DraftedReply
  /** What the policy would have permitted, recorded even while drafting only. */
  wouldAutoSend: boolean
  mustEscalate: boolean
  policyReason: string
  usage: Usage
}

export type Turn = { role: "user" | "assistant"; content: string }

export async function draftReply(
  ctx: ActionContext,
  input: {
    /** Oldest first. The inbound message being answered is the last entry. */
    history: Turn[]
    customerName?: string | null
  }
): Promise<ReplyResult> {
  const model = modelFor("chat")
  const client = getAnthropic()
  const knowledge = await companyKnowledge()

  let captured: DraftedReply | null = null

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
  // UI calls — there is no separate read path for the assistant.
  const tools = [...buildTools(ctx, ["search_products", "get_customer"]), replyTool]

  const runner = client.beta.messages.toolRunner({
    model,
    max_tokens: MAX_TOKENS,
    output_config: outputConfig(model, EFFORT.chat),
    system: [
      { type: "text", text: PERSONA },
      {
        // Stable between conversations, so it is a cache read after the first.
        type: "text",
        text: `# What you know about the company\n\n${knowledge}`,
        cache_control: { type: "ephemeral" },
      },
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
  const policy = replyPolicy(draft.intent)

  return {
    draft,
    // The model's own judgement can only ever *reduce* autonomy, never grant it.
    wouldAutoSend: policy.wouldAutoSend && !draft.needsHuman,
    mustEscalate: policy.mustEscalate,
    policyReason: policy.reason,
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
