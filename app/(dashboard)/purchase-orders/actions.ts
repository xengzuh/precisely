"use server"

import {
  createPurchaseOrder,
  receivePurchaseOrder,
} from "@/lib/erp/actions/definitions/purchasing"
import { invoke } from "@/lib/erp/actions/server"
import type { Uom } from "@/types/database"

/**
 * Purchase orders now carry line items. The dialog still creates one line at a
 * time, so this wrapper keeps that shape while the underlying order supports
 * many — the multi-line editor lands with the rest of the order UI.
 */
export async function addPurchaseOrder({
  supplierId,
  productId,
  quantity,
  unitCost,
  uom = "ea",
  lotCode,
  expiryDate,
}: {
  supplierId: string
  productId: string
  quantity: number
  unitCost: number
  uom?: Uom
  lotCode?: string | null
  expiryDate?: string | null
}): Promise<void> {
  await invoke(createPurchaseOrder, {
    supplierId,
    lines: [
      {
        productId,
        qty: quantity,
        uom,
        unitCost,
        lotCode: lotCode ?? null,
        expiryDate: expiryDate ?? null,
      },
    ],
  })
}

export async function markReceived(orderId: string): Promise<void> {
  await invoke(receivePurchaseOrder, { orderId })
}
