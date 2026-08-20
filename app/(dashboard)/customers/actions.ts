"use server"

import { invoke } from "@/lib/erp/actions/server"
import { upsertCustomer } from "@/lib/erp/actions/definitions/parties"

/**
 * Thin wrapper over the action registry — see CLAUDE.md rule 1. No Supabase
 * access here; the registry is what audits the write and gates the agent path.
 *
 * FormData is untyped, so the keys below must match the action's zod schema by
 * hand. A mismatch is a runtime failure the compiler cannot catch.
 */
export async function saveCustomer(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key)
    const trimmed = typeof value === "string" ? value.trim() : ""
    return trimmed === "" ? null : trimmed
  }

  const number = (key: string) => {
    const value = text(key)
    return value === null ? null : Number(value)
  }

  const customerId = text("customerId")

  await invoke(upsertCustomer, {
    customerId,
    name: formData.get("name") as string,
    email: text("email"),
    phone: text("phone"),
    billingAddress: text("billingAddress"),
    deliveryAddress: text("deliveryAddress"),
    taxId: text("taxId"),
    paymentTermsDays: number("paymentTermsDays") ?? 30,
    creditLimit: number("creditLimit"),
    notes: text("notes"),
  })
}
