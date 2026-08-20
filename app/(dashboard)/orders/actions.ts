"use server"

import {
  allocateSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  createInvoice,
  fulfilSalesOrder,
  updateSalesOrderLine,
} from "@/lib/erp/actions/definitions/sales"
import { invoke } from "@/lib/erp/actions/server"

/**
 * Thin wrappers over the action registry — see CLAUDE.md rule 1.
 *
 * The order workflow is a one-way ratchet: draft → confirmed → allocated →
 * fulfilled → invoiced. Each step is its own action so each gets its own audit
 * row and its own autonomy policy; an org can let an agent confirm orders
 * without letting it ship them.
 */

export async function confirmOrder(orderId: string) {
  await invoke(confirmSalesOrder, { orderId })
}

export async function allocateOrder(orderId: string) {
  await invoke(allocateSalesOrder, { orderId })
}

export async function fulfilOrder(orderId: string) {
  await invoke(fulfilSalesOrder, { orderId })
}

export async function cancelOrder(orderId: string, reason?: string) {
  await invoke(cancelSalesOrder, { orderId, reason })
}

export async function invoiceOrder(orderId: string) {
  const result = await invoke(createInvoice, { orderId })
  return result.invoiceId
}

export async function updateOrderLine(input: {
  lineId: string
  productId?: string | null
  qty?: number
  unitPrice?: number
}) {
  await invoke(updateSalesOrderLine, input)
}
