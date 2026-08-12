import { importProducts } from "./definitions/imports"
import { getCustomer, upsertCustomer, upsertSupplier } from "./definitions/parties"
import {
  adjustStock,
  createProduct,
  recordQuickSale,
  searchProducts,
} from "./definitions/products"
import { createPurchaseOrder, receivePurchaseOrder } from "./definitions/purchasing"
import {
  allocateSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  createInvoice,
  createSalesOrder,
  fulfilSalesOrder,
  sendInvoice,
} from "./definitions/sales"
import type { AnyActionDefinition } from "./types"

/**
 * Every business operation in the system.
 *
 * Adding an action here is what makes it callable by name, which means it is
 * simultaneously available to the UI, to the approval inbox, and to agents.
 * There is no separate agent tool list to keep in sync — and no way to give an
 * agent a capability the audit log and policy gate do not cover.
 */
const ACTIONS = [
  // Catalog
  createProduct,
  adjustStock,
  recordQuickSale,
  searchProducts,
  importProducts,
  // Parties
  upsertCustomer,
  getCustomer,
  upsertSupplier,
  // Sales
  createSalesOrder,
  confirmSalesOrder,
  allocateSalesOrder,
  fulfilSalesOrder,
  cancelSalesOrder,
  createInvoice,
  sendInvoice,
  // Purchasing
  createPurchaseOrder,
  receivePurchaseOrder,
] as const

let cached: Record<string, AnyActionDefinition> | null = null

export function getRegistry(): Record<string, AnyActionDefinition> {
  if (cached) return cached

  const map: Record<string, AnyActionDefinition> = {}
  for (const action of ACTIONS) {
    const definition = action as unknown as AnyActionDefinition
    if (map[definition.name]) {
      throw new Error(`Duplicate action name in registry: ${definition.name}`)
    }
    map[definition.name] = definition
  }

  cached = map
  return map
}

/** Actions an agent is allowed to see. Phase 3's tool bridge reads this. */
export function getAgentTools(): AnyActionDefinition[] {
  return Object.values(getRegistry()).filter((a) => a.agentExposed)
}

export function getAction(name: string): AnyActionDefinition | undefined {
  return getRegistry()[name]
}
