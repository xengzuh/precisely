import { describe, expect, it } from "vitest"
import { MAX_TERMS, searchTerms } from "@/lib/erp/search"

describe("searchTerms", () => {
  it("splits a phrase so every word has to match somewhere", () => {
    expect(searchTerms("isopropyl alcohol")).toEqual(["isopropyl", "alcohol"])
  })

  it("keeps a single word intact", () => {
    expect(searchTerms("IPA")).toEqual(["IPA"])
  })

  it("reaches a SKU the whole phrase never would", () => {
    // The case this exists for: "IPA 99%" has to find SOL-IPA-99 /
    // "Isopropyl Alcohol 99%", where no one column contains "IPA 99%".
    expect(searchTerms("IPA 99%")).toEqual(["IPA", "99"])
  })

  it("strips the wildcards so a typed % cannot match every row", () => {
    expect(searchTerms("32%")).toEqual(["32"])
  })

  it("drops single characters, which match nearly everything", () => {
    expect(searchTerms("a caustic soda")).toEqual(["caustic", "soda"])
  })

  it("treats punctuation between words as a separator", () => {
    expect(searchTerms("sodium hydroxide, 32% (flake)")).toEqual([
      "sodium",
      "hydroxide",
      "32",
      "flake",
    ])
  })

  it("keeps hyphens inside a SKU but not around it", () => {
    expect(searchTerms("SOL-IPA-99")).toEqual(["SOL-IPA-99"])
    expect(searchTerms("-IPA-")).toEqual(["IPA"])
  })

  it("counts a repeated word once", () => {
    expect(searchTerms("soda Soda SODA")).toEqual(["soda"])
  })

  it("caps the terms, since every extra one only narrows further", () => {
    const terms = searchTerms("sodium laureth sulphate seventy percent in drums please")
    expect(terms).toHaveLength(MAX_TERMS)
    expect(terms[0]).toBe("sodium")
  })

  it("returns no terms for a query with nothing searchable in it", () => {
    // The caller has to treat this as "no matches". Dropping every condition
    // instead would return the whole catalog, which is the one outcome worse
    // than finding nothing.
    expect(searchTerms("   ")).toEqual([])
    expect(searchTerms("")).toEqual([])
    expect(searchTerms("%_%")).toEqual([])
    expect(searchTerms("x")).toEqual([])
  })
})
