/**
 * Domain types shared across the UI.
 *
 * Row shapes come from `types/database.ts` (generated from the schema); the
 * types here are the read models the pages actually render — a product row
 * plus its computed availability, an order plus its joined party name.
 */
import type {
  BatchRow,
  CustomerRow,
  PackageTypeRow,
  ProductRow,
  PurchaseOrderRow,
  SalesOrderRow,
  StockMoveRow,
  SupplierRow,
  Uom,
} from "@/types/database"

export type {
  BatchRow,
  CustomerRow,
  PackageTypeRow,
  ProductRow,
  PurchaseOrderRow,
  SalesOrderRow,
  StockMoveRow,
  SupplierRow,
  Uom,
}

/** What the inventory list needs: the product plus what is actually sellable. */
export type ProductListItem = Pick<
  ProductRow,
  | "id"
  | "sku"
  | "name"
  | "grade"
  | "concentration_pct"
  | "base_uom"
  | "density_kg_per_l"
  | "cost_price"
  | "list_price"
  | "reorder_point"
  | "is_batch_tracked"
  | "created_at"
> & {
  /** on hand minus reserved, summed across batches for batch-tracked products */
  available: number
  onHand: number
  reserved: number
  /** earliest expiry among lots holding stock, when tracked */
  nextExpiry: string | null
}

export type Supplier = SupplierRow
export type Customer = CustomerRow

export type PurchaseOrderListItem = Pick<
  PurchaseOrderRow,
  "id" | "order_no" | "status" | "order_date" | "expected_date" | "total" | "currency"
> & {
  supplierName: string | null
  lineCount: number
}

export type SalesOrderListItem = Pick<
  SalesOrderRow,
  "id" | "order_no" | "status" | "source" | "order_date" | "total" | "currency" | "needs_review"
> & {
  customerName: string | null
  lineCount: number
}

/** A row in the stock ledger, as rendered on the movements screens. */
export type StockMovement = Pick<
  StockMoveRow,
  | "id"
  | "direction"
  | "qty"
  | "entered_qty"
  | "entered_uom"
  | "unit_cost"
  | "reason"
  | "ref_type"
  | "created_at"
> & {
  productName: string | null
  productSku: string | null
  baseUom: Uom
  lotCode: string | null
}
