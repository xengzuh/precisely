import { z } from "zod"
import { defineAction } from "../define"
import { ActionError } from "../types"

const contact = {
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email address").nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  taxId: z.string().trim().nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(180).default(30),
  notes: z.string().trim().nullable().optional(),
}

export const upsertCustomer = defineAction({
  name: "upsert_customer",
  description:
    "Create a customer, or update one when customerId is supplied. Look the customer up first — " +
    "creating a duplicate splits their order history and credit limit across two records.",
  defaultMode: "approve",
  schema: z.object({
    customerId: z.uuid().nullable().optional(),
    ...contact,
    billingAddress: z.string().trim().nullable().optional(),
    deliveryAddress: z.string().trim().nullable().optional(),
    creditLimit: z.number().min(0).nullable().optional(),
  }),
  risk: (i) => (i.customerId ? "low" : "medium"),
  summarize: (i) => (i.customerId ? `Update customer ${i.name}` : `Create customer ${i.name}`),
  revalidate: ["/customers"],
  async execute(ctx, input) {
    const row = {
      org_id: ctx.orgId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      billing_address: input.billingAddress ?? null,
      delivery_address: input.deliveryAddress ?? null,
      tax_id: input.taxId ?? null,
      payment_terms_days: input.paymentTermsDays,
      credit_limit: input.creditLimit ?? null,
      notes: input.notes ?? null,
    }

    if (input.customerId) {
      const { error } = await ctx.db
        .from("customers")
        .update(row)
        .eq("id", input.customerId)
        .eq("org_id", ctx.orgId)

      if (error) throw new ActionError(error.message, "execution_failed")
      return { customerId: input.customerId, created: false }
    }

    const { data, error } = await ctx.db.from("customers").insert(row).select("id").single()
    if (error) throw new ActionError(error.message, "execution_failed")
    return { customerId: data.id, created: true }
  },
})

export const getCustomer = defineAction({
  name: "get_customer",
  description:
    "Find a customer by name or email. Returns their id, payment terms, addresses, and any " +
    "learned product aliases — the wording this customer uses for catalog products.",
  defaultMode: "auto",
  minRole: "viewer",
  schema: z.object({
    query: z.string().trim().min(1),
  }),
  risk: () => "low",
  summarize: (i) => `Look up customer "${i.query}"`,
  async execute(ctx, input) {
    const pattern = `%${input.query.replace(/[%_]/g, "")}%`

    const { data, error } = await ctx.db
      .from("customers")
      // Single literal — see the note in products.ts searchProducts.
      .select(
        "id, name, email, phone, billing_address, delivery_address, payment_terms_days, credit_limit, customer_product_aliases(raw_text, product_id, package_type_id)"
      )
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .or(`name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5)

    if (error) throw new ActionError(error.message, "execution_failed")
    return { matches: data ?? [] }
  },
})

export const upsertSupplier = defineAction({
  name: "upsert_supplier",
  description: "Create a supplier, or update one when supplierId is supplied.",
  defaultMode: "approve",
  schema: z.object({
    supplierId: z.uuid().nullable().optional(),
    ...contact,
    billingAddress: z.string().trim().nullable().optional(),
  }),
  risk: () => "low",
  summarize: (i) => (i.supplierId ? `Update supplier ${i.name}` : `Create supplier ${i.name}`),
  revalidate: ["/suppliers"],
  async execute(ctx, input) {
    const row = {
      org_id: ctx.orgId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      billing_address: input.billingAddress ?? null,
      tax_id: input.taxId ?? null,
      payment_terms_days: input.paymentTermsDays,
      notes: input.notes ?? null,
    }

    if (input.supplierId) {
      const { error } = await ctx.db
        .from("suppliers")
        .update(row)
        .eq("id", input.supplierId)
        .eq("org_id", ctx.orgId)

      if (error) throw new ActionError(error.message, "execution_failed")
      return { supplierId: input.supplierId, created: false }
    }

    const { data, error } = await ctx.db.from("suppliers").insert(row).select("id").single()
    if (error) throw new ActionError(error.message, "execution_failed")
    return { supplierId: data.id, created: true }
  },
})
