import { describe, expect, it } from "vitest"
import { normalizeAlias } from "@/lib/erp/aliases"

/**
 * The alias key. Every variant a customer might type has to collapse to one
 * row, or the same lesson gets learned over and over and the table stops
 * paying for itself.
 */
describe("normalizeAlias", () => {
  it("lowercases", () => {
    expect(normalizeAlias("IPA 99%")).toBe("ipa 99%")
  })

  it("trims", () => {
    expect(normalizeAlias("  caustic soda  ")).toBe("caustic soda")
  })

  it("collapses internal whitespace", () => {
    expect(normalizeAlias("IPA   99%")).toBe("ipa 99%")
    expect(normalizeAlias("IPA\t99%")).toBe("ipa 99%")
    expect(normalizeAlias("IPA\n99%")).toBe("ipa 99%")
  })

  it("maps the variants of one wording onto a single key", () => {
    const variants = ["IPA 99%", "ipa 99%", "  IPA  99%  ", "Ipa\t99%"]
    expect(new Set(variants.map(normalizeAlias)).size).toBe(1)
  })

  it("keeps genuinely different wordings apart", () => {
    // Concentration is part of the identity of a chemical, not noise.
    expect(normalizeAlias("caustic soda 32%")).not.toBe(normalizeAlias("caustic soda flakes"))
    expect(normalizeAlias("IPA 99%")).not.toBe(normalizeAlias("IPA 70%"))
  })

  it("preserves punctuation that carries meaning", () => {
    // Stripping "%" would merge "32%" into "32", and "32 kg" is not "32%".
    expect(normalizeAlias("Caustic Soda 32%")).toBe("caustic soda 32%")
  })
})
