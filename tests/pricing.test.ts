import { describe, expect, it } from "vitest"
import { priceNote, resolveLinePrice } from "@/lib/erp/pricing"

describe("resolveLinePrice", () => {
  it("uses the document's price when it states one", () => {
    expect(resolveLinePrice({ statedPrice: 8.75, listPrice: 9.5 })).toEqual({
      unitPrice: 8.75,
      source: "document",
    })
  })

  it("keeps a negotiated price below list", () => {
    // The customer's PO is a commercial commitment. Silently re-pricing an
    // agreed 8.00 up to a 9.50 list price is how you lose the account.
    expect(resolveLinePrice({ statedPrice: 8, listPrice: 9.5 }).unitPrice).toBe(8)
  })

  it("falls back to list price when the document is silent", () => {
    expect(resolveLinePrice({ statedPrice: null, listPrice: 9.5 })).toEqual({
      unitPrice: 9.5,
      source: "list",
    })
    expect(resolveLinePrice({ statedPrice: undefined, listPrice: 9.5 }).source).toBe("list")
  })

  it("treats a stated zero as an instruction, not a missing value", () => {
    // Free of charge, a sample, a replacement for a rejected batch. Overwriting
    // this with the list price bills a customer for goods promised free.
    expect(resolveLinePrice({ statedPrice: 0, listPrice: 9.5 })).toEqual({
      unitPrice: 0,
      source: "document",
    })
  })

  it("reports unpriced when there is no price anywhere", () => {
    expect(resolveLinePrice({ statedPrice: null, listPrice: null })).toEqual({
      unitPrice: 0,
      source: "unpriced",
    })
    // A product with no list price set is not a zero-priced product.
    expect(resolveLinePrice({ statedPrice: null, listPrice: 0 }).source).toBe("unpriced")
  })

  it("does not accept a negative price from a document", () => {
    expect(resolveLinePrice({ statedPrice: -5, listPrice: 9.5 }).unitPrice).toBe(0)
  })

  it("ignores a non-finite stated price", () => {
    expect(resolveLinePrice({ statedPrice: NaN, listPrice: 9.5 }).source).toBe("list")
  })
})

describe("priceNote", () => {
  it("explains a price the reviewer will not find on the document", () => {
    expect(priceNote("list")).toContain("list price")
    expect(priceNote("unpriced")).toContain("needs pricing")
  })

  it("says nothing when the price came from the document", () => {
    expect(priceNote("document")).toBeNull()
  })
})
