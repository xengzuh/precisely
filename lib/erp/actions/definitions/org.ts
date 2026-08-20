import { z } from "zod"
import { defineAction } from "../define"
import { ActionError } from "../types"

/**
 * How much rope an agent gets for one action.
 *
 * `auto` executes without asking, `approve` always queues for a human, `off`
 * refuses outright. A threshold makes `auto` conditional on value, which is
 * the usual shape: let the agent raise a RM 200 order unattended, not a
 * RM 200,000 one.
 */
export const setAutonomyPolicy = defineAction({
  name: "set_autonomy_policy",
  description: "Set how much autonomy agents have over one action.",
  defaultMode: "approve",
  minRole: "admin",
  // An agent that can widen its own permissions has no permissions.
  agentExposed: false,
  schema: z.object({
    action: z.string().trim().min(1),
    mode: z.enum(["auto", "approve", "off"]),
    thresholdAmount: z.number().min(0).nullable().optional(),
  }),
  risk: () => "high",
  summarize: (i) => `Set ${i.action} autonomy to ${i.mode}`,
  revalidate: ["/agents/policies", "/agents"],
  async execute(ctx, input) {
    const { error } = await ctx.db.from("autonomy_policies").upsert(
      {
        org_id: ctx.orgId,
        action: input.action,
        mode: input.mode,
        threshold_amount: input.thresholdAmount ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,action" }
    )

    if (error) throw new ActionError(error.message, "execution_failed")
    return { action: input.action, mode: input.mode }
  },
})

/**
 * Organization settings.
 *
 * These are the business constants the rest of the app reads rather than
 * hard-codes: the tax rate applied by create_sales_order, the currency and
 * locale every figure is formatted in, and the label printed on invoices.
 * Changing the tax rate affects orders raised from now on — totals already
 * stored on past orders and invoices are untouched, which is what you want:
 * an invoice must keep saying what it said when it was issued.
 */
export const updateOrganization = defineAction({
  name: "update_organization",
  description:
    "Update the organization's business settings — display name, currency, locale, and the tax " +
    "rate and label applied to new orders. Does not change tax already computed on existing " +
    "orders or invoices.",
  defaultMode: "approve",
  // Settings are org-wide and quietly affect every future document, so this is
  // an owner/admin action and never one an agent should reach for.
  minRole: "admin",
  agentExposed: false,
  schema: z.object({
    name: z.string().trim().min(1, "Name is required"),
    currency: z
      .string()
      .trim()
      .length(3, "Use a 3-letter ISO currency code, e.g. MYR")
      .transform((v) => v.toUpperCase()),
    taxRate: z
      .number()
      .min(0, "Tax rate cannot be negative")
      .max(1, "Enter the rate as a fraction — 0.06 for 6%"),
    taxLabel: z.string().trim().min(1, "Give the tax a name, e.g. SST"),
    locale: z.string().trim().min(2, "e.g. en-MY"),
  }),
  risk: () => "medium",
  summarize: (i) => `Update organization settings for ${i.name}`,
  revalidate: ["/settings", "/dashboard", "/invoices", "/orders"],
  async execute(ctx, input) {
    const { error } = await ctx.db
      .from("organizations")
      .update({
        name: input.name,
        currency: input.currency,
        tax_rate: input.taxRate,
        tax_label: input.taxLabel,
        locale: input.locale,
      })
      .eq("id", ctx.orgId)

    if (error) throw new ActionError(error.message, "execution_failed")
    return { orgId: ctx.orgId }
  },
})
