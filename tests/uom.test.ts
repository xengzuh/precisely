import { describe, expect, it } from "vitest"
import {
  baseToPackages,
  convert,
  formatQty,
  packagesToBase,
  resolveToBase,
  roundMoney,
  roundQty,
  UomError,
} from "@/lib/erp/uom"

/**
 * These are the conversions a wrong answer ships as a wrong quantity of a
 * chemical, so they get the most direct tests in the suite.
 */

// Isopropyl alcohol: the running example, and light enough that mixing kg and
// L up is a 21% error rather than a rounding difference.
const IPA_DENSITY = 0.786

describe("convert", () => {
  it("returns the same quantity when the units match", () => {
    expect(convert(100, "kg", "kg")).toBe(100)
    expect(convert(2.5, "L", "L")).toBe(2.5)
  })

  it("converts litres to kilograms through density", () => {
    expect(convert(1000, "L", "kg", IPA_DENSITY)).toBe(786)
  })

  it("converts kilograms to litres through density", () => {
    expect(convert(786, "kg", "L", IPA_DENSITY)).toBe(1000)
  })

  it("round-trips without drift", () => {
    const there = convert(500, "L", "kg", IPA_DENSITY)
    expect(convert(there, "kg", "L", IPA_DENSITY)).toBe(500)
  })

  it("refuses to convert mass to volume without a density", () => {
    // The whole point: an unknown density must be an error, never an assumed
    // 1.0, which would silently overstate an IPA order by 27%.
    expect(() => convert(100, "L", "kg")).toThrow(UomError)
    expect(() => convert(100, "L", "kg", null)).toThrow(UomError)
    expect(() => convert(100, "L", "kg", 0)).toThrow(UomError)
  })

  it("refuses to convert countable units to mass or volume", () => {
    expect(() => convert(5, "ea", "kg", IPA_DENSITY)).toThrow(UomError)
    expect(() => convert(5, "L", "ea", IPA_DENSITY)).toThrow(UomError)
  })

  it("rounds to four decimal places", () => {
    // 1 / 0.786 = 1.27226463... — quantities are numeric(14,4) in the database.
    expect(convert(1, "kg", "L", IPA_DENSITY)).toBe(1.2723)
  })
})

describe("packages", () => {
  const drum = { qty_per_package: 200, uom: "L" as const }
  const bag = { qty_per_package: 25, uom: "kg" as const }

  it("expands packages into the base unit", () => {
    expect(packagesToBase(3, drum, "L")).toBe(600)
    expect(packagesToBase(20, bag, "kg")).toBe(500)
  })

  it("converts when the package unit differs from the base unit", () => {
    // A 200 L drum of a product stocked in kg.
    expect(packagesToBase(2, drum, "kg", IPA_DENSITY)).toBe(314.4)
  })

  it("goes back the other way", () => {
    expect(baseToPackages(600, drum, "L")).toBe(3)
    expect(baseToPackages(314.4, drum, "kg", IPA_DENSITY)).toBe(2)
  })

  it("reports fractional packages rather than rounding them away", () => {
    // 250 L is a drum and a quarter. Silently calling it 1 loses 50 litres.
    expect(baseToPackages(250, drum, "L")).toBe(1.25)
  })
})

describe("resolveToBase", () => {
  const litreProduct = { base_uom: "L" as const, density_kg_per_l: IPA_DENSITY }
  const drum = { qty_per_package: 200, uom: "L" as const }

  it("prefers the package count when one is given", () => {
    expect(resolveToBase({ qty: 0, packageCount: 4 }, litreProduct, drum)).toBe(800)
  })

  it("converts a stated unit that is not the base unit", () => {
    expect(resolveToBase({ qty: 786, uom: "kg" }, litreProduct)).toBe(1000)
  })

  it("passes a base-unit quantity straight through", () => {
    expect(resolveToBase({ qty: 42.5, uom: "L" }, litreProduct)).toBe(42.5)
  })

  it("propagates the missing-density error rather than guessing", () => {
    const noDensity = { base_uom: "L" as const, density_kg_per_l: null }
    expect(() => resolveToBase({ qty: 100, uom: "kg" }, noDensity)).toThrow(UomError)
  })
})

describe("rounding", () => {
  it("rounds money to cents", () => {
    expect(roundMoney(12.345)).toBe(12.35)
    expect(roundMoney(12.344)).toBe(12.34)
  })

  it("rounds quantities to four places", () => {
    expect(roundQty(1.00005)).toBe(1.0001)
  })
})

describe("formatQty", () => {
  it("appends the unit", () => {
    expect(formatQty(200, "L")).toBe("200 L")
    expect(formatQty(25, "kg")).toBe("25 kg")
  })

  it("leaves countable units bare", () => {
    expect(formatQty(12, "ea")).toBe("12")
  })

  it("trims trailing zeros", () => {
    expect(formatQty(2.5, "L")).toBe("2.5 L")
    expect(formatQty(100, "kg")).toBe("100 kg")
  })
})
