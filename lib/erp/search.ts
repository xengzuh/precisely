/**
 * Turning what somebody typed into catalog search terms.
 *
 * A chemical catalog is searched with phrases that never appear verbatim in it.
 * "IPA 99%" is `SOL-IPA-99 / Isopropyl Alcohol 99%`, and no single column
 * contains the string "IPA 99%". Matching the whole phrase against each column
 * therefore finds nothing, and the assistant reports a stocked product as
 * unavailable — which is worse than a slow answer.
 *
 * Splitting into terms and requiring *all* of them to appear fixes that without
 * the opposite failure. Widening to "any term matches" would return half the
 * catalog for "sodium something", and a search that returns everything is how
 * an assistant ends up reciting a stock list at a customer who asked one
 * question.
 */

/** Punctuation that is noise in a search but meaningful in a SKU or a name. */
const SEPARATORS = /[\s,;/\\|+&()[\]{}'"]+/

export const MAX_TERMS = 4

export function searchTerms(query: string): string[] {
  const terms = query
    .split(SEPARATORS)
    // A percent sign is both a wildcard and half of every concentration in the
    // catalog. Stripping it keeps "99%" searchable as "99" and keeps a typed
    // "%" from matching every row.
    .map((t) => t.replace(/[%_]/g, "").replace(/^[-.]+|[-.]+$/g, "").trim())
    // Single characters match nearly everything and cost a whole AND clause.
    .filter((t) => t.length > 1)

  // Deduplicate case-insensitively: "Soda soda" is one condition, not two.
  const seen = new Set<string>()
  const unique = terms.filter((t) => {
    const key = t.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Every extra term is another AND, and past a few they only ever narrow a
  // real match away — a customer's sentence carries more words than a product
  // name has.
  //
  // An empty result means the query was all wildcards or single characters.
  // The caller must read that as "no matches", never as "no conditions": a
  // search that quietly returns the whole catalog is how an assistant ends up
  // reading a stock list to someone who asked about one product.
  return unique.slice(0, MAX_TERMS)
}
