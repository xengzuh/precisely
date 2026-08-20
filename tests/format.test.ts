import { describe, expect, it } from "vitest"
import { daysUntil, formatDate, formatMoney } from "@/lib/erp/format"

const MY = { currency: "MYR", locale: "en-MY" }

describe("formatMoney", () => {
  it("formats in the organization's currency", () => {
    // Non-breaking spaces vary by ICU build, so assert on the parts that matter.
    const out = formatMoney(1234.5, MY)
    expect(out).toContain("1,234.50")
    expect(out).toMatch(/RM|MYR/)
  })

  it("follows the organization rather than a hard-coded default", () => {
    const out = formatMoney(1234.5, { currency: "SGD", locale: "en-SG" })
    expect(out).toContain("1,234.50")
    expect(out).not.toMatch(/RM\b/)
  })

  it("handles negatives", () => {
    expect(formatMoney(-50, MY)).toContain("50.00")
  })
})

describe("formatDate", () => {
  it("renders a date-only value", () => {
    expect(formatDate("2026-08-13", MY)).toBe("13 Aug 2026")
  })

  it("does not slide a day backwards west of Greenwich", () => {
    // The bug this guards: parsing "2026-01-01" as local midnight and then
    // formatting in UTC turns New Year's Day into 31 December.
    expect(formatDate("2026-01-01", { currency: "USD", locale: "en-US" })).toContain("2026")
    expect(formatDate("2026-01-01", { currency: "USD", locale: "en-US" })).toContain("Jan")
  })

  it("accepts a full timestamp and ignores the time part", () => {
    expect(formatDate("2026-08-13T23:59:00Z", MY)).toBe("13 Aug 2026")
  })

  it("renders an em dash for null", () => {
    expect(formatDate(null, MY)).toBe("—")
  })
})

describe("daysUntil", () => {
  const iso = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

  it("counts forward to a future date", () => {
    expect(daysUntil(iso(30))).toBe(30)
  })

  it("returns zero for today", () => {
    expect(daysUntil(iso(0))).toBe(0)
  })

  it("goes negative once the date has passed", () => {
    expect(daysUntil(iso(-5))).toBe(-5)
  })

  it("returns null when there is no due date", () => {
    expect(daysUntil(null)).toBeNull()
  })
})
