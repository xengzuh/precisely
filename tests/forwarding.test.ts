import { describe, expect, it } from "vitest"
import { parseMessageBody } from "@/lib/erp/email"

/**
 * Forwarding is the intended way to hand this system an order: the act of
 * forwarding is a human saying "this one is real". These tests pin the two
 * things that has to get right — keeping the order, and attributing it to the
 * customer rather than to whoever pressed Forward.
 */

const ORDER = "Please supply 2 x 200 L drums IPA 99% and 500 kg citric acid."

describe("Gmail forward", () => {
  const body = [
    "Please process this order for Acme Coatings.",
    "",
    "---------- Forwarded message ---------",
    "From: Ahmad Faizal <ahmad@acmecoatings.com>",
    "Date: Wed, 12 Aug 2026 at 09:14",
    "Subject: PO 4471",
    "To: Sales <sales@selangorchem.com>",
    "",
    ORDER,
  ].join("\n")

  const parsed = parseMessageBody(body, "Fwd: PO 4471")

  it("keeps the forwarded order", () => {
    // The original failure: this content was stripped as if it were history.
    expect(parsed.content).toContain("IPA 99%")
    expect(parsed.content).toContain("citric acid")
  })

  it("drops the covering note", () => {
    expect(parsed.content).not.toContain("Please process this order")
  })

  it("attributes the order to the customer, not the forwarder", () => {
    expect(parsed.forwardedFrom).toBe("ahmad@acmecoatings.com")
  })

  it("recovers the original subject, which carries the PO number", () => {
    expect(parsed.forwardedSubject).toBe("PO 4471")
  })

  it("reports the kind", () => {
    expect(parsed.kind).toBe("forward")
  })
})

describe("Outlook forward with no banner", () => {
  // Outlook often prints no banner at all — the subject is the only signal,
  // and the header block is structurally identical to a reply header.
  const body = [
    "FYI, please handle this one today.",
    "",
    "From: Ahmad Faizal <ahmad@acmecoatings.com>",
    "Sent: Wednesday, 12 August 2026 09:14",
    "To: Sales",
    "Subject: PO 4471",
    "",
    ORDER,
  ].join("\n")

  it("is detected from the subject line", () => {
    const parsed = parseMessageBody(body, "FW: PO 4471")
    expect(parsed.kind).toBe("forward")
    expect(parsed.content).toContain("IPA 99%")
    expect(parsed.forwardedFrom).toBe("ahmad@acmecoatings.com")
  })

  it("without the subject signal it is read as a reply and history is stripped", () => {
    // Documents the limit: an unbannered forward with no FW: subject is
    // indistinguishable from a reply, and is treated as one.
    expect(parseMessageBody(body, "PO 4471").kind).toBe("direct")
  })
})

describe("Apple Mail forward", () => {
  it("handles its banner", () => {
    const body = [
      "See below.",
      "",
      "Begin forwarded message:",
      "",
      "From: Ahmad Faizal <ahmad@acmecoatings.com>",
      "Subject: PO 4471",
      "Date: 12 August 2026 at 09:14",
      "",
      ORDER,
    ].join("\n")

    const parsed = parseMessageBody(body, "Fwd: PO 4471")
    expect(parsed.content).toContain("IPA 99%")
    expect(parsed.forwardedFrom).toBe("ahmad@acmecoatings.com")
  })
})

describe("forward of a reply chain", () => {
  it("keeps the order but drops the history underneath it", () => {
    const body = [
      "Please action.",
      "",
      "---------- Forwarded message ---------",
      "From: Ahmad Faizal <ahmad@acmecoatings.com>",
      "Date: Wed, 12 Aug 2026 at 09:14",
      "Subject: RE: PO 4471",
      "",
      ORDER,
      "",
      "On Tue, 11 Aug 2026, Sales <sales@selangorchem.com> wrote:",
      "> Our quotation for 1000 L sulphuric acid 98% is attached.",
    ].join("\n")

    const parsed = parseMessageBody(body, "Fwd: RE: PO 4471")
    expect(parsed.content).toContain("IPA 99%")
    // The quoted quotation names a different product — extracting from it
    // would create an order the customer never placed.
    expect(parsed.content).not.toContain("sulphuric")
  })
})

describe("a plain reply is not mistaken for a forward", () => {
  it("still strips history", () => {
    const body = [
      "Approved, please proceed with the order below.",
      "",
      "-----Original Message-----",
      "From: Sales",
      "Sent: 11 August 2026",
      "Subject: Quotation",
      "",
      "1000 L sulphuric acid 98%",
    ].join("\n")

    const parsed = parseMessageBody(body, "RE: Quotation")
    expect(parsed.kind).toBe("reply")
    expect(parsed.content).toBe("Approved, please proceed with the order below.")
    expect(parsed.forwardedFrom).toBeNull()
  })
})

describe("forward whose sender cannot be parsed", () => {
  it("reports no sender rather than the wrong one", () => {
    // Falling back to the envelope From would attribute the order to the staff
    // member who forwarded it, applying another company's learned aliases.
    const body = ["---------- Forwarded message ---------", "", ORDER].join("\n")
    const parsed = parseMessageBody(body, "Fwd: order")

    expect(parsed.forwardedFrom).toBeNull()
    expect(parsed.content).toContain("IPA 99%")
  })
})

describe("safety when the shape is unrecognised", () => {
  it("keeps everything rather than risk discarding the order", () => {
    // Subject says forward, no banner, no header block. Stripping too much
    // destroys the order; keeping too much leaves the model something to work
    // with. The asymmetry decides it.
    const body = "Order from Acme: 3 x 250 L drums NaOH 32%."
    const parsed = parseMessageBody(body, "FW: order")

    expect(parsed.kind).toBe("forward")
    expect(parsed.content).toContain("NaOH 32%")
  })

  it("handles an empty body", () => {
    expect(parseMessageBody("", "Fwd: nothing").content).toBe("")
    expect(parseMessageBody(null).kind).toBe("direct")
  })
})
