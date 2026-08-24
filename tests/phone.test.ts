import { describe, expect, it } from "vitest"
import { normalizePhone, phoneKey, samePhone } from "@/lib/erp/phone"

describe("phone matching", () => {
  it("treats the ways one Malaysian number gets written as the same person", () => {
    const written = [
      "+60 12-345 6789",
      "60123456789",
      "0123456789",
      "012-345 6789",
      "+60123456789",
    ]
    const keys = new Set(written.map(phoneKey))
    expect(keys.size).toBe(1)
  })

  it("still tells different numbers apart", () => {
    expect(samePhone("+60123456789", "+60123456780")).toBe(false)
  })

  it("strips a leading zero", () => {
    expect(normalizePhone("0123456789")).toBe("123456789")
  })

  it("rejects anything too short to be a number", () => {
    expect(normalizePhone("123")).toBeNull()
    expect(phoneKey("")).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })

  it("does not match two absent numbers to each other", () => {
    // Otherwise every contact with no number on file collapses into one customer.
    expect(samePhone(null, null)).toBe(false)
    expect(samePhone("", "")).toBe(false)
  })
})
