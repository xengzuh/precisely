import { describe, expect, it } from "vitest"
import {
  emailDomain,
  isFreemailDomain,
  isLikelyOrderAttachment,
  parseEmailAddress,
  stripQuotedReply,
} from "@/lib/erp/email"

describe("parseEmailAddress", () => {
  it("accepts a bare address", () => {
    expect(parseEmailAddress("orders@acme.com")).toBe("orders@acme.com")
  })

  it("pulls the address out of a display-name header", () => {
    expect(parseEmailAddress("Ahmad Faizal <ahmad@acme.com.my>")).toBe("ahmad@acme.com.my")
  })

  it("handles a quoted display name containing a comma", () => {
    expect(parseEmailAddress('"Faizal, Ahmad" <ahmad@acme.com.my>')).toBe("ahmad@acme.com.my")
  })

  it("lowercases, so matching a customer record is case-insensitive", () => {
    expect(parseEmailAddress("Orders@ACME.com")).toBe("orders@acme.com")
  })

  it("returns null for junk rather than a wrong match", () => {
    expect(parseEmailAddress("undisclosed-recipients")).toBeNull()
    expect(parseEmailAddress("")).toBeNull()
    expect(parseEmailAddress(null)).toBeNull()
  })
})

describe("emailDomain / isFreemailDomain", () => {
  it("extracts the domain", () => {
    expect(emailDomain("ahmad@acme.com.my")).toBe("acme.com.my")
  })

  it("flags shared consumer domains", () => {
    // A shared gmail.com domain says nothing about who the sender is, so it
    // must never be used to attach an order to a customer.
    expect(isFreemailDomain("gmail.com")).toBe(true)
    expect(isFreemailDomain("yahoo.com.my")).toBe(true)
    expect(isFreemailDomain("acme.com.my")).toBe(false)
  })
})

describe("stripQuotedReply", () => {
  it("cuts a Gmail-style reply at the quote marker", () => {
    const body = [
      "Please supply 2 drums of IPA 99%.",
      "",
      "On Wed, 12 Aug 2026 at 09:14, Sales <sales@us.com> wrote:",
      "> Here is our quotation for 500 kg caustic soda.",
      "> Regards",
    ].join("\n")

    const out = stripQuotedReply(body)
    expect(out).toBe("Please supply 2 drums of IPA 99%.")
    // The dangerous case: the quoted history holds a *different* order.
    expect(out).not.toContain("caustic")
  })

  it("cuts an Outlook original-message block", () => {
    const body = [
      "Approved, please proceed.",
      "",
      "-----Original Message-----",
      "From: Sales",
      "Sent: 11 August 2026",
      "Please confirm 1000 L of sulphuric acid.",
    ].join("\n")

    const out = stripQuotedReply(body)
    expect(out).toBe("Approved, please proceed.")
    expect(out).not.toContain("sulphuric")
  })

  it("cuts an Outlook forward header block", () => {
    const body = [
      "Please treat the order below as confirmed.",
      "",
      "From: Ahmad",
      "Sent: 10 Aug",
      "Old order text",
    ].join("\n")
    expect(stripQuotedReply(body)).toBe("Please treat the order below as confirmed.")
  })

  it("keeps a very short covering note together with what it sits above", () => {
    // "Approved." above a quoted quotation is ambiguous — the order may only
    // exist in the quoted part. The guard errs towards keeping everything,
    // because a human reviewing too much beats an order silently lost.
    const body = ["Approved.", "", "> 2 x 200 L drums IPA 99%", "> 500 kg citric acid"].join("\n")
    expect(stripQuotedReply(body)).toContain("IPA 99%")
  })

  it("cuts a run of quoted lines", () => {
    const body = ["Order: 3 IBC glycerine.", "", "> previous message", "> more history"].join("\n")
    expect(stripQuotedReply(body)).toBe("Order: 3 IBC glycerine.")
  })

  it("drops an RFC signature block", () => {
    const body = ["Please send 25 kg citric acid.", "", "-- ", "Ahmad Faizal", "Acme Sdn Bhd"].join(
      "\n"
    )
    expect(stripQuotedReply(body)).toBe("Please send 25 kg citric acid.")
  })

  it("keeps the whole message when stripping would leave nothing", () => {
    // A forwarded PO with no covering note is entirely quoted text. Cutting it
    // to nothing would throw the order away — the exact failure this guards.
    const body = [
      "FYI",
      "",
      "---------- Forwarded message ----------",
      "From: Ahmad <ahmad@acme.com>",
      "",
      "Please supply 2 x 200 L drums IPA 99% and 500 kg caustic soda.",
    ].join("\n")

    const out = stripQuotedReply(body)
    expect(out).toContain("IPA 99%")
    expect(out).toContain("caustic soda")
  })

  it("leaves a message with no quoting alone", () => {
    const body = "Please supply 2 x 200 L drums IPA 99%."
    expect(stripQuotedReply(body)).toBe(body)
  })

  it("normalises CRLF so markers still match", () => {
    const body = "New order: 4 bags citric acid.\r\n\r\n> quoted\r\n> quoted more"
    expect(stripQuotedReply(body)).toBe("New order: 4 bags citric acid.")
  })

  it("handles empty input", () => {
    expect(stripQuotedReply(null)).toBe("")
    expect(stripQuotedReply("")).toBe("")
  })
})

describe("isLikelyOrderAttachment", () => {
  it("accepts a real PDF attachment", () => {
    expect(
      isLikelyOrderAttachment({ contentType: "application/pdf", size: 240_000, name: "PO4471.pdf" })
    ).toBe(true)
  })

  it("rejects non-PDFs", () => {
    expect(isLikelyOrderAttachment({ contentType: "image/png", size: 400_000 })).toBe(false)
  })

  it("rejects inline parts, which are signature images", () => {
    expect(
      isLikelyOrderAttachment({
        contentType: "application/pdf",
        contentId: "logo@acme",
        size: 400_000,
      })
    ).toBe(false)
  })

  it("rejects tiny PDFs", () => {
    // Paying per-page image tokens to read a 3 KB logo is pure waste.
    expect(isLikelyOrderAttachment({ contentType: "application/pdf", size: 3_000 })).toBe(false)
  })

  it("accepts when size is unknown rather than discarding a possible order", () => {
    expect(isLikelyOrderAttachment({ contentType: "application/pdf", size: null })).toBe(true)
  })
})
