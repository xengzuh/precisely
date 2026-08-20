"use server"

import { recordInvoicePayment, sendInvoice } from "@/lib/erp/actions/definitions/sales"
import { invoke } from "@/lib/erp/actions/server"

/** Thin wrappers over the action registry — see CLAUDE.md rule 1. */

export async function markInvoiceSent(invoiceId: string) {
  await invoke(sendInvoice, { invoiceId })
}

export async function recordPayment(invoiceId: string, amount: number) {
  await invoke(recordInvoicePayment, { invoiceId, amount })
}
