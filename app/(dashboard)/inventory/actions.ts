"use server"

import { getUserContext } from "@/lib/erp/actions/context"
import {
  adjustStock,
  createProduct,
  recordQuickSale,
} from "@/lib/erp/actions/definitions/products"
import { invoke } from "@/lib/erp/actions/server"
import { findProductBySku } from "@/lib/erp/queries"
import type { ProductListItem } from "@/lib/types"
import type { Uom } from "@/types/database"

/**
 * Thin wrappers over the action registry.
 *
 * These exist only to give client components a `"use server"` entry point —
 * all validation, policy, auditing, and revalidation live in the action
 * definitions, so the UI and the agents genuinely share one code path.
 */

export async function addProduct(formData: FormData): Promise<void> {
  const num = (key: string): number | undefined => {
    const raw = formData.get(key)?.toString().trim()
    if (!raw) return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }

  await invoke(createProduct, {
    sku: formData.get("sku")?.toString() ?? "",
    name: formData.get("name")?.toString() ?? "",
    grade: formData.get("grade")?.toString() || undefined,
    baseUom: (formData.get("baseUom")?.toString() as Uom) || "ea",
    densityKgPerL: num("densityKgPerL") ?? null,
    concentrationPct: num("concentrationPct") ?? null,
    costPrice: num("costPrice") ?? 0,
    listPrice: num("listPrice") ?? 0,
    reorderPoint: num("reorderPoint") ?? null,
    isBatchTracked: formData.get("isBatchTracked") === "on",
    openingQty: num("openingQty") ?? 0,
    openingLotCode: formData.get("openingLotCode")?.toString() || undefined,
  })
}

export async function sellProduct(productId: string, quantity: number): Promise<void> {
  await invoke(recordQuickSale, { productId, qty: quantity })
}

export async function quickStockIn(productId: string, quantity = 1): Promise<void> {
  await invoke(adjustStock, {
    productId,
    direction: "in",
    qty: quantity,
    reason: "adjustment",
  })
}

/**
 * Barcode lookup for the scanner. Read-only, so it does not go through the
 * registry. Returns availability rather than the raw row: for a batch-tracked
 * product `products.qty_on_hand` is always 0, so the raw row would tell the
 * operator every lot-tracked chemical is out of stock.
 */
export async function getProductBySku(sku: string): Promise<ProductListItem | null> {
  const ctx = await getUserContext()
  return findProductBySku(ctx, sku)
}
