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

/**
 * Things the system has verified about this turn, as opposed to things the
 * model said about it. Only facts belong here.
 */
export type ReplyFacts = {
  /** A draft sales order was actually written, and its id is on record. */
  orderRecorded?: boolean
}

export function replyPolicy(
  intent: MessageIntent | null,
  facts: ReplyFacts = {}
): ReplyDecision {
  // An unclassified message is the same risk as an unrecognised one.
  const base = intent ? POLICY[intent] : POLICY.other

  // An order reply changes class once the order exists. Before, the assistant
  // would be committing the business to supply something; after, it is
  // acknowledging a row a colleague is about to confirm — the same kind of
  // statement as an availability answer, and verifiably true.
  //
  // This turns on a database write having happened, never on the model saying
  // it did. When the order was not recorded — an unknown number, a product it
  // could not pin down — the reply is improvisation about a commercial
  // request, and that still waits for a person.
  if (intent === "order" && facts.orderRecorded) {
    return {
      wouldAutoSend: true,
      mustEscalate: false,
      reason: "The order is recorded as a draft, so the reply is a receipt rather than a promise",
    }
  }

  return base
}

/**
 * Intents the assistant may answer unattended, for the system prompt.
 * Derived from the policy so the two can never drift apart.
 */
export function autoSendableIntents(): MessageIntent[] {
  return (Object.keys(POLICY) as MessageIntent[]).filter((i) => POLICY[i].wouldAutoSend)
}
