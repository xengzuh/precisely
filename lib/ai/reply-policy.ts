import type { MessageIntent } from "@/types/database"

/**
 * How much autonomy a reply gets, by what the customer asked for.
 *
 * The split is not about model confidence. It is about what a sentence
 * *commits the business to*. "We stock four grades of caustic soda" is a
 * statement of fact the system can verify. "That'll be RM 3.40 a litre" is an
 * offer, and "it'll be here Tuesday" is a promise — neither is the model's to
 * make.
 */
export type ReplyDecision = {
  /** Whether policy alone would allow this to send without a human. */
  wouldAutoSend: boolean
  /** Questions a model must never answer, however sure it sounds. */
  mustEscalate: boolean
  reason: string
}

const POLICY: Record<MessageIntent, ReplyDecision> = {
  availability: {
    wouldAutoSend: true,
    mustEscalate: false,
    reason: "What we stock is a fact, read live from the catalog",
  },
  stock_check: {
    wouldAutoSend: true,
    mustEscalate: false,
    reason: "Current stock is read live at the moment of asking",
  },
  smalltalk: {
    wouldAutoSend: true,
    mustEscalate: false,
    reason: "A greeting commits the business to nothing",
  },
  pricing: {
    wouldAutoSend: false,
    mustEscalate: false,
    reason: "A quoted price is an offer, and customers are on different terms",
  },
  restock: {
    wouldAutoSend: false,
    mustEscalate: false,
    reason: "A date is a promise, and supplier dates move",
  },
  order: {
    wouldAutoSend: false,
    mustEscalate: false,
    reason: "Taking an order is a commitment to supply",
  },
  regulatory: {
    wouldAutoSend: false,
    mustEscalate: true,
    reason:
      "Hazard, handling, and compatibility questions carry legal and safety liability — a person answers these, citing the SDS",
  },
  other: {
    wouldAutoSend: false,
    mustEscalate: false,
    reason: "Unclassified, so a person should look at it",
  },
}

export function replyPolicy(intent: MessageIntent | null): ReplyDecision {
  // An unclassified message is the same risk as an unrecognised one.
  return intent ? POLICY[intent] : POLICY.other
}

/**
 * Intents the assistant may answer unattended, for the system prompt.
 * Derived from the policy so the two can never drift apart.
 */
export function autoSendableIntents(): MessageIntent[] {
  return (Object.keys(POLICY) as MessageIntent[]).filter((i) => POLICY[i].wouldAutoSend)
}
