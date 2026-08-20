import type { ActionContext } from "@/lib/erp/actions/types"

/**
 * Learned product vocabulary.
 *
 * Customers do not order from your catalog, they order from their own habits:
 * "isopropanol", "IPA 99 tech", "the 32% caustic". Every time a human resolves
 * one of those in the line editor, that correction is worth keeping — it is
 * the difference between a system that makes the same mistake forever and one
 * that gets measurably better per use.
 */

/**
 * The lookup key. The unique constraint is on the stored text, so normalising
 * on write is what stops "IPA 99%", "ipa 99%", and "IPA  99%" becoming three
 * rows that each have to be learned separately.
 */
export function normalizeAlias(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Record that this customer's wording means this product.
 *
 * Deliberately best-effort: a failure here must never fail the correction the
 * user actually asked for. Losing a lesson costs someone thirty seconds later;
 * losing their edit costs it now.
 */
export async function recordAlias(
  ctx: ActionContext,
  input: {
    customerId: string | null
    rawText: string | null
    productId: string
    packageTypeId?: string | null
  }
): Promise<void> {
  // An alias with no customer would apply org-wide, and one customer's private
  // shorthand is not a fact about the catalog. A line with no raw text was
  // typed by a person, not extracted — there is no wording to learn.
  if (!input.customerId || !input.rawText?.trim()) return

  const rawText = normalizeAlias(input.rawText)
  if (rawText.length < 3) return

  const { error } = await ctx.db.from("customer_product_aliases").upsert(
    {
      org_id: ctx.orgId,
      customer_id: input.customerId,
      raw_text: rawText,
      product_id: input.productId,
      package_type_id: input.packageTypeId ?? null,
      created_by: ctx.userId,
    },
    { onConflict: "org_id,customer_id,raw_text" }
  )

  if (error) {
    console.warn("[aliases] could not record alias:", error.message)
  }
}

/**
 * Resolve wording straight to a product, skipping the model entirely.
 *
 * The payoff for recording aliases at all: a distributor's volume is repeat
 * orders, and a repeat order is one whose every line has been seen before.
 */
export async function lookupAliases(
  ctx: ActionContext,
  customerId: string,
  rawTexts: string[]
): Promise<Map<string, { productId: string; packageTypeId: string | null }>> {
  const keys = [...new Set(rawTexts.map(normalizeAlias).filter((k) => k.length >= 3))]
  if (keys.length === 0) return new Map()

  const { data, error } = await ctx.db
    .from("customer_product_aliases")
    .select("raw_text, product_id, package_type_id")
    .eq("org_id", ctx.orgId)
    .eq("customer_id", customerId)
    .in("raw_text", keys)

  if (error) {
    console.warn("[aliases] lookup failed:", error.message)
    return new Map()
  }

  return new Map(
    (data ?? []).map((row) => [
      row.raw_text,
      { productId: row.product_id, packageTypeId: row.package_type_id },
    ])
  )
}
