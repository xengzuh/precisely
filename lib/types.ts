/**
 * Domain types shared across the UI.
 *
 * Row shapes come from `types/database.ts` (generated from the schema); the
 * types here are the read models the pages actually render — a product row
 * plus its computed availability, an order plus its joined party name.
 */
import type {
  AgentActionRow,
  AgentRunRow,
  AutonomyPolicyRow,
  BatchRow,
  CustomerRow,
  InvoiceLineRow,
  InvoiceRow,
  OrganizationRow,
  PackageTypeRow,
  ProductRow,
  PurchaseOrderRow,
  SalesOrderLineRow,
  SalesOrderRow,
  StockMoveRow,
  SupplierRow,
  Uom,
} from "@/types/database"

export type {
  AgentActionRow,
  AgentRunRow,
  AutonomyPolicyRow,
  BatchRow,
  CustomerRow,
  InvoiceLineRow,
  InvoiceRow,
  OrganizationRow,
  PackageTypeRow,
  ProductRow,
  PurchaseOrderRow,
  SalesOrderLineRow,
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

/** The product page: the catalog row, how it ships, its lots, and its ledger. */
export type ProductDetail = ProductRow & {
  packageTypes: PackageTypeRow[]
  /** earliest expiry first — the order FEFO will consume them in */
  batches: BatchRow[]
  moves: StockMovement[]
  available: number
  onHand: number
  reserved: number
  nextExpiry: string | null
}

export type CustomerListItem = Pick<
  CustomerRow,
  "id" | "name" | "email" | "phone" | "payment_terms_days" | "credit_limit" | "created_at"
> & {
  orderCount: number
  /** invoiced but not yet settled — what the customer actually owes */
  outstanding: number
}

/**
 * One line of a sales order, joined to what it refers to.
 *
 * `productId` may be null: a line extracted from a customer's document that
 * could not be matched to the catalog keeps `descriptionRaw` and waits for a
 * human. That is the whole point of the field — see createSalesOrder.
 */
export type SalesOrderLineDetail = Pick<
  SalesOrderLineRow,
  | "id"
  | "line_no"
  | "qty"
  | "uom"
  | "unit_price"
  | "line_total"
  | "qty_allocated"
  | "description_raw"
  | "match_confidence"
  | "needs_review"
  | "notes"
> & {
  productId: string | null
  productName: string | null
  productSku: string | null
  baseUom: Uom | null
  isBatchTracked: boolean
  /** the lot this line was reserved from, once allocated */
  lotCode: string | null
  lotExpiry: string | null
}

export type SalesOrderDetail = SalesOrderRow & {
  customer: CustomerRow | null
  lines: SalesOrderLineDetail[]
  /** set once an invoice has been raised from this order */
  invoiceId: string | null
  invoiceNo: string | null
}

export type InvoiceListItem = Pick<
  InvoiceRow,
  | "id"
  | "invoice_no"
  | "status"
  | "issue_date"
  | "due_date"
  | "currency"
  | "total"
  | "amount_paid"
> & {
  customerName: string | null
  orderNo: string | null
  /** past its due date with a balance still outstanding */
  isOverdue: boolean
  balance: number
}

export type InvoiceLineDetail = Pick<
  InvoiceLineRow,
  "id" | "line_no" | "description" | "qty" | "uom" | "unit_price" | "line_total"
> & {
  productSku: string | null
}

export type InvoiceDetail = InvoiceRow & {
  customer: CustomerRow | null
  orderNo: string | null
  lines: InvoiceLineDetail[]
  isOverdue: boolean
  balance: number
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
