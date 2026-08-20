/**
 * Where a sales order line's unit price comes from.
 *
 * The document is authoritative when it states a price — a customer's PO is a
 * commercial commitment and what it says wins. When it says nothing, the
 * catalog's list price applies.
 *
 * Both of those are deterministic lookups rather than model judgement, and
 * deliberately so: the model is told never to supply a price, because a
 * hallucinated one is a wrong invoice, and a wrong invoice is a credit note,
 * an apology, and a customer who checks every line from then on.
 */
export type PriceSource = "document" | "list" | "unpriced"

export function resolveLinePrice(input: {
  /** What the document stated. Null when it stated nothing. */
  statedPrice: number | null | undefined
  /** The catalog price for the matched product, if a product was matched. */
  listPrice: number | null | undefined
}): { unitPrice: number; source: PriceSource } {
  // A stated zero is a real instruction — free of charge, a sample, a
  // replacement — and must not be overwritten by the list price. That is why
  // "not stated" is null rather than 0.
  if (typeof input.statedPrice === "number" && Number.isFinite(input.statedPrice)) {
    return { unitPrice: Math.max(input.statedPrice, 0), source: "document" }
  }

  if (typeof input.listPrice === "number" && input.listPrice > 0) {
    return { unitPrice: input.listPrice, source: "list" }
  }

  // No stated price, and either no matched product or a product with no list
  // price set. Zero is the only honest answer; the line needs a human.
  return { unitPrice: 0, source: "unpriced" }
}

/** Note for the reviewer explaining a price they did not see on the document. */
export function priceNote(source: PriceSource): string | null {
  switch (source) {
    case "list":
      return "Priced at catalog list price — the document did not state one"
    case "unpriced":
      return "No price on the document and no list price set — needs pricing"
    case "document":
      return null
  }
}
