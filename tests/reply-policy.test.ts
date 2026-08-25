import { describe, expect, it } from "vitest"
import { autoSendableIntents, replyPolicy } from "@/lib/ai/reply-policy"

describe("replyPolicy", () => {
  it("lets the assistant answer questions of fact", () => {
    expect(replyPolicy("availability").wouldAutoSend).toBe(true)
    expect(replyPolicy("stock_check").wouldAutoSend).toBe(true)
    expect(replyPolicy("smalltalk").wouldAutoSend).toBe(true)
  })

  it("holds back anything that commits the business", () => {
    // A price is an offer, a date is a promise, an order is a supply commitment.
    expect(replyPolicy("pricing").wouldAutoSend).toBe(false)
    expect(replyPolicy("restock").wouldAutoSend).toBe(false)
    expect(replyPolicy("order").wouldAutoSend).toBe(false)
  })

  it("lets an order reply through once the order is actually on record", () => {
    // The reply stops being a promise and becomes a receipt for a draft row a
    // colleague is about to confirm.
    const decision = replyPolicy("order", { orderRecorded: true })
    expect(decision.wouldAutoSend).toBe(true)
    expect(decision.mustEscalate).toBe(false)
  })

  it("still holds an order reply back when nothing was recorded", () => {
    // No order written means the assistant is improvising about a commercial
    // request — an unknown caller, or a product it could not pin down.
    expect(replyPolicy("order", { orderRecorded: false }).wouldAutoSend).toBe(false)
    expect(replyPolicy("order", {}).wouldAutoSend).toBe(false)
  })

  it("does not let a recorded order unlock any other intent", () => {
    // The exemption is about what an order reply *says*, not a general licence.
    // A price is still an offer even on a turn that wrote an order down.
    for (const intent of ["pricing", "restock", "regulatory", "other"] as const) {
      expect(replyPolicy(intent, { orderRecorded: true }).wouldAutoSend).toBe(false)
    }
    expect(replyPolicy(null, { orderRecorded: true }).wouldAutoSend).toBe(false)
  })

  it("never lets a recorded order downgrade a regulatory escalation", () => {
    expect(replyPolicy("regulatory", { orderRecorded: true }).mustEscalate).toBe(true)
  })

  it("escalates regulatory questions instead of answering them", () => {
    const decision = replyPolicy("regulatory")
    expect(decision.mustEscalate).toBe(true)
    expect(decision.wouldAutoSend).toBe(false)
  })

  it("treats an unclassified message as needing a person", () => {
    expect(replyPolicy(null).wouldAutoSend).toBe(false)
    expect(replyPolicy("other").wouldAutoSend).toBe(false)
  })

  it("never marks an escalating intent as auto-sendable", () => {
    // The two flags must not contradict: escalate means a human, full stop.
    for (const intent of autoSendableIntents()) {
      expect(replyPolicy(intent).mustEscalate).toBe(false)
    }
  })

  it("gives a reason for every decision, since it is shown to a reviewer", () => {
    const intents = ["availability", "pricing", "regulatory", "other"] as const
    for (const i of intents) expect(replyPolicy(i).reason.length).toBeGreaterThan(10)
  })
})
