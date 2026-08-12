"use server"

import { upsertSupplier } from "@/lib/erp/actions/definitions/parties"
import { invoke } from "@/lib/erp/actions/server"

export async function addSupplier(formData: FormData): Promise<void> {
  await invoke(upsertSupplier, {
    name: formData.get("name")?.toString() ?? "",
    email: formData.get("email")?.toString() || null,
    phone: formData.get("phone")?.toString() || null,
    billingAddress: formData.get("billingAddress")?.toString() || null,
    paymentTermsDays: Number(formData.get("paymentTermsDays") ?? 30) || 30,
  })
}
