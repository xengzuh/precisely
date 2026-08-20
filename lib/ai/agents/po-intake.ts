import type Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import {
  EFFORT,
  MAX_TOKENS,
  MODEL,
  assertNotRefused,
  getAnthropic,
  outputConfig,
  priceUsage,
  type Usage,
} from "@/lib/ai/client"
import type { ActionContext } from "@/lib/erp/actions/types"

/**
 * Turn a customer's purchase order document into a draft sales order.
 *
 * One structured-output call, not a tool-calling loop. For a distributor with
 * a few hundred SKUs the whole catalog fits in a cached system prefix, which
 * is cheaper, faster, and more accurate than letting the model search for
 * matches one line at a time — it can see every candidate at once.
 */

const extractedLine = z.object({
  descriptionRaw: z
    .string()
    .describe("The line exactly as written on the document, verbatim, including any product code"),
  productId: z
    .string()
    .nullable()
    .describe("Catalog product id, or null when no confident match exists"),
  matchConfidence: z
    .number()
    .nullable()
    .describe("0 to 1. How sure you are of the product match. Null when productId is null"),
  qty: z.number().describe("Quantity converted to the product's base unit of measure"),
  uom: z.string().describe("The base unit the qty is expressed in: kg, L, or ea"),
  packageCount: z
    .number()
    .nullable()
    .describe("Number of packages ordered, when the document ordered by package"),
  packageTypeId: z.string().nullable().describe("Matched package type id, when ordered by package"),
  unitPrice: z
    .number()
    .nullable()
    .describe(
      "Price per base unit exactly as the document states it. Null when the document states no " +
        "price — do not substitute one. Use 0 only when the document itself says the goods are free."
    ),
  needsReview: z.boolean().describe("True when a human must check this line before it is acted on"),
  notes: z
    .string()
    .nullable()
    .describe("Anything ambiguous: unclear units, an unreadable quantity, a product not in the catalog"),
})

const extraction = z.object({
  customerId: z.string().nullable().describe("Matched customer id, or null if not identified"),
  customerNameRaw: z.string().nullable().describe("Customer name as written on the document"),
  customerRef: z.string().nullable().describe("The customer's own PO number"),
  requestedDate: z
    .string()
    .nullable()
    .describe("Requested delivery date as YYYY-MM-DD, or null"),
  currency: z.string().nullable().describe("Currency code if stated on the document"),
  lines: z.array(extractedLine),
  documentNotes: z
    .string()
    .nullable()
    .describe("Anything about the document as a whole worth flagging to a human"),
})

export type PoExtraction = z.infer<typeof extraction>

const SYSTEM = `You read purchase order documents for a chemical distributor and turn them into draft sales orders.

How to convert quantities — this is the part that matters most:
- Every qty you return must be in the product's BASE unit of measure, shown in the catalog.
- If the document orders packages ("10 drums", "3 IBCs", "20 bags"), find the matching package type
  for that product and multiply: qty = packageCount x qtyPerPackage. Set packageCount and
  packageTypeId as well, so a human can check the arithmetic.
- If the document states a mass for a product stocked in litres (or the reverse), convert using
  that product's density: litres = kg / density, kg = litres x density.
- If the product has NO density and the units differ, you cannot convert. Leave productId null,
  set needsReview, and say so in notes. Never assume a density of 1.0.

How to match products:
- Match on substance, grade, and concentration together. "Caustic soda 32%" and "caustic soda flakes"
  are different products.
- A customer's own wording may already be recorded as an alias — those are listed with the customer
  and are the strongest signal available.
- If you cannot match a line with confidence, leave productId null, set needsReview true, and put the
  document's exact wording in descriptionRaw. A wrong chemical match puts the wrong drum on a truck.
  An unmatched line costs someone thirty seconds. Never guess between two plausible products.
- Set matchConfidence honestly. Below roughly 0.9, set needsReview as well.

What you must never do:
- Never invent a product id, package type id, or customer id that is not in the data given to you.
- Never state or infer hazard class, UN number, packing group, or any other regulatory attribute.
  Those come from a curated source, not from you.
- Never supply a price the document does not state. Return null for unitPrice and the system will
  apply the catalog price itself. A price you invent becomes an invoice someone has to retract.
  If the document does state prices, report them exactly, including a stated price of zero.`

type CatalogProduct = {
  id: string
  sku: string
  name: string
  grade: string | null
  concentration_pct: number | null
  base_uom: string
  density_kg_per_l: number | null
  list_price: number
  package_types: { id: string; name: string; qty_per_package: number; uom: string }[] | null
}

/** The catalog, rendered compactly. This is the cached part of the prompt. */
function renderCatalog(products: CatalogProduct[]): string {
  const lines = products.map((p) => {
    const bits = [
      `${p.sku} | ${p.name}`,
      p.grade ? `grade ${p.grade}` : null,
      p.concentration_pct !== null ? `${p.concentration_pct}%` : null,
      `base ${p.base_uom}`,
      p.density_kg_per_l !== null ? `density ${p.density_kg_per_l} kg/L` : "no density",
      `list ${p.list_price}`,
      `id=${p.id}`,
    ].filter(Boolean)

    const packages = (p.package_types ?? [])
      .map((pt) => `    package "${pt.name}" holds ${pt.qty_per_package} ${pt.uom} (id=${pt.id})`)
      .join("\n")

    return packages ? `${bits.join(" | ")}\n${packages}` : bits.join(" | ")
  })

  return lines.join("\n")
}

function renderCustomers(
  customers: { id: string; name: string; email: string | null; aliases: string[] }[]
): string {
  return customers
    .map((c) => {
      const head = `${c.name}${c.email ? ` <${c.email}>` : ""} | id=${c.id}`
      return c.aliases.length > 0 ? `${head}\n    also calls products: ${c.aliases.join("; ")}` : head
    })
    .join("\n")
}

export type IntakeInput = {
  /** A PDF, base64-encoded, when the document arrived as a file. */
  pdfBase64?: string | null
  /** Pasted email or plain-text order body. */
  text?: string | null
  fromAddress?: string | null
  subject?: string | null
  /**
   * A customer already resolved from the sender address. Passing this turns
   * customer identification from a judgement into a lookup, and is what makes
   * that customer's learned aliases usable.
   */
  knownCustomer?: { id: string; name: string } | null
}

export type IntakeResult = {
  extraction: PoExtraction
  usage: Usage
}

export async function extractPurchaseOrder(
  ctx: ActionContext,
  input: IntakeInput
): Promise<IntakeResult> {
  if (!input.pdfBase64 && !input.text?.trim()) {
    throw new Error("Nothing to read — provide a PDF or the text of the order")
  }

  const [productsResult, customersResult, orgResult] = await Promise.all([
    ctx.db
      .from("products")
      .select(
        "id, sku, name, grade, concentration_pct, base_uom, density_kg_per_l, list_price, package_types(id, name, qty_per_package, uom)"
      )
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("sku"),
    ctx.db
      .from("customers")
      .select("id, name, email, customer_product_aliases(raw_text)")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("name"),
    ctx.db.from("organizations").select("name, currency").eq("id", ctx.orgId).single(),
  ])

  if (productsResult.error) throw new Error(productsResult.error.message)
  if (customersResult.error) throw new Error(customersResult.error.message)
  if (orgResult.error) throw new Error(orgResult.error.message)

  const catalog = renderCatalog(productsResult.data as CatalogProduct[])
  const customers = renderCustomers(
    (customersResult.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      aliases: (c.customer_product_aliases ?? []).map((a) => a.raw_text),
    }))
  )

  const client = getAnthropic()

  const userContent: Anthropic.ContentBlockParam[] = []

  // The document goes before the instruction text — the model reads better
  // when it has the material in hand before being told what to do with it.
  if (input.pdfBase64) {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
    })
  }

  const envelope = [
    input.fromAddress ? `From: ${input.fromAddress}` : null,
    input.subject ? `Subject: ${input.subject}` : null,
    // Stated as settled fact, not a hint: the address was matched against the
    // customer record in code, which is stronger evidence than any company
    // name appearing in the body.
    input.knownCustomer
      ? `The sender's address is on file for ${input.knownCustomer.name}. Use customerId "${input.knownCustomer.id}" unless the document itself clearly states it is for a different company, in which case say so in documentNotes.`
      : null,
  ]
    .filter(Boolean)
    .join("\n")

  userContent.push({
    type: "text",
    text: [
      envelope,
      input.text ? `Order text:\n${input.text}` : null,
      "Extract this purchase order.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  })

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: outputConfig(EFFORT.extraction, zodOutputFormat(extraction)),
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        text: `Organization: ${orgResult.data.name} (${orgResult.data.currency})\n\nCUSTOMERS\n${customers}\n\nCATALOG\n${catalog}`,
        // The catalog and customer list are stable between documents while the
        // document itself is not, so the breakpoint goes here — everything
        // above it is read from cache on every subsequent intake.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  })

  assertNotRefused(response)

  if (!response.parsed_output) {
    throw new Error("The model returned no structured output for this document")
  }

  return {
    extraction: response.parsed_output,
    usage: priceUsage(response.usage),
  }
}
