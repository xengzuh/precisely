/**
 * Supabase schema types.
 *
 * Hand-written to match supabase/schema.sql. Once the project is linked, keep
 * it in sync with:
 *
 *   npm run db:types
 *
 * which runs `supabase gen types typescript` and overwrites this file.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Uom = "kg" | "L" | "ea"
export type MemberRole = "owner" | "admin" | "operator" | "viewer"
export type DocumentKind = "sales_order" | "purchase_order" | "invoice"
export type StockDirection = "in" | "out"
export type StockReason =
  | "opening"
  | "import"
  | "sale"
  | "purchase"
  | "adjustment"
  | "return"
  | "write_off"
  | "reversal"
export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "allocated"
  | "fulfilled"
  | "invoiced"
  | "cancelled"
export type PurchaseOrderStatus = "draft" | "ordered" | "partial" | "received" | "cancelled"
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void"
export type OrderSource = "manual" | "agent" | "import"
export type AgentRunStatus = "running" | "succeeded" | "failed" | "cancelled"
export type AgentTrigger = "manual" | "email" | "schedule" | "api"
export type ActionRisk = "low" | "medium" | "high"
export type ActionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "reverted"
export type AutonomyMode = "auto" | "approve" | "off"
export type InboundSource = "upload" | "email" | "api"
export type InboundStatus =
  | "received"
  | "parsing"
  | "parsed"
  | "failed"
  | "applied"
  | "discarded"

/** Row shape helpers: Insert makes server-defaulted columns optional. */
type Defaulted<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type OrganizationRow = {
  id: string
  name: string
  currency: string
  tax_rate: number
  tax_label: string
  country: string
  locale: string
  timezone: string
  created_at: string
}

export type MembershipRow = {
  user_id: string
  org_id: string
  role: MemberRole
  created_at: string
}

export type DocumentSequenceRow = {
  org_id: string
  kind: DocumentKind
  prefix: string
  next_value: number
}

export type ProductRow = {
  id: string
  org_id: string
  sku: string
  name: string
  description: string | null
  grade: string | null
  concentration_pct: number | null
  substance_id: string | null
  base_uom: Uom
  density_kg_per_l: number | null
  cost_price: number
  list_price: number
  reorder_point: number | null
  reorder_qty: number | null
  is_batch_tracked: boolean
  shelf_life_days: number | null
  qty_on_hand: number
  qty_reserved: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PackageTypeRow = {
  id: string
  org_id: string
  product_id: string
  name: string
  qty_per_package: number
  uom: Uom
  tare_kg: number | null
  is_default: boolean
  created_at: string
}

export type BatchRow = {
  id: string
  org_id: string
  product_id: string
  lot_code: string
  mfg_date: string | null
  expiry_date: string | null
  qty_on_hand: number
  qty_reserved: number
  created_at: string
}

export type StockMoveRow = {
  id: string
  org_id: string
  product_id: string
  batch_id: string | null
  direction: StockDirection
  qty: number
  entered_qty: number | null
  entered_uom: string | null
  unit_cost: number | null
  reason: StockReason
  ref_type: string | null
  ref_id: string | null
  reverses_id: string | null
  agent_action_id: string | null
  created_by: string | null
  created_at: string
}

export type CustomerRow = {
  id: string
  org_id: string
  name: string
  email: string | null
  phone: string | null
  billing_address: string | null
  delivery_address: string | null
  tax_id: string | null
  payment_terms_days: number
  credit_limit: number | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export type SupplierRow = {
  id: string
  org_id: string
  name: string
  email: string | null
  phone: string | null
  billing_address: string | null
  tax_id: string | null
  payment_terms_days: number
  notes: string | null
  is_active: boolean
  created_at: string
}

export type SalesOrderRow = {
  id: string
  org_id: string
  customer_id: string | null
  order_no: string
  customer_ref: string | null
  status: SalesOrderStatus
  source: OrderSource
  order_date: string
  requested_date: string | null
  currency: string
  subtotal: number
  tax: number
  total: number
  notes: string | null
  needs_review: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SalesOrderLineRow = {
  id: string
  org_id: string
  order_id: string
  line_no: number
  product_id: string | null
  description_raw: string | null
  qty: number
  uom: string
  package_type_id: string | null
  package_count: number | null
  unit_price: number
  line_total: number
  batch_id: string | null
  qty_allocated: number
  match_confidence: number | null
  needs_review: boolean
  notes: string | null
}

export type PurchaseOrderRow = {
  id: string
  org_id: string
  supplier_id: string | null
  order_no: string
  status: PurchaseOrderStatus
  source: OrderSource
  order_date: string
  expected_date: string | null
  currency: string
  subtotal: number
  tax: number
  total: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PurchaseOrderLineRow = {
  id: string
  org_id: string
  order_id: string
  line_no: number
  product_id: string
  qty: number
  uom: string
  package_type_id: string | null
  unit_cost: number
  line_total: number
  qty_received: number
  lot_code: string | null
  expiry_date: string | null
}

export type InvoiceRow = {
  id: string
  org_id: string
  order_id: string | null
  customer_id: string | null
  invoice_no: string
  status: InvoiceStatus
  issue_date: string
  due_date: string | null
  currency: string
  subtotal: number
  tax: number
  total: number
  amount_paid: number
  pdf_path: string | null
  sent_at: string | null
  paid_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type InvoiceLineRow = {
  id: string
  org_id: string
  invoice_id: string
  line_no: number
  product_id: string | null
  description: string
  qty: number
  uom: string
  unit_price: number
  line_total: number
}

export type AgentRunRow = {
  id: string
  org_id: string
  agent: string
  trigger: AgentTrigger
  status: AgentRunStatus
  model: string | null
  input_ref: string | null
  tokens_in: number
  tokens_out: number
  cost_usd: number
  error: string | null
  started_at: string
  ended_at: string | null
}

export type AgentActionRow = {
  id: string
  org_id: string
  run_id: string | null
  action: string
  args: Json
  risk: ActionRisk
  actor: "user" | "agent"
  status: ActionStatus
  result: Json | null
  error: string | null
  summary: string | null
  proposed_at: string
  requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  executed_at: string | null
  reverted_at: string | null
  reverted_by: string | null
}

export type AutonomyPolicyRow = {
  id: string
  org_id: string
  action: string
  mode: AutonomyMode
  threshold_amount: number | null
  updated_at: string
}

export type InboundDocumentRow = {
  id: string
  org_id: string
  source: InboundSource
  from_address: string | null
  subject: string | null
  storage_path: string | null
  mime: string | null
  body_text: string | null
  status: InboundStatus
  extracted: Json | null
  agent_run_id: string | null
  sales_order_id: string | null
  error: string | null
  created_by: string | null
  created_at: string
}

export type CustomerProductAliasRow = {
  id: string
  org_id: string
  customer_id: string | null
  raw_text: string
  product_id: string
  package_type_id: string | null
  hit_count: number
  created_by: string | null
  created_at: string
}

/**
 * Foreign-key metadata. Supabase resolves embedded selects — `products(...)`
 * nested inside a query on another table — from these entries, so an embed
 * whose relationship is not declared here comes back as a SelectQueryError
 * rather than a typed row.
 */
type Rel<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name
  columns: [Col]
  isOneToOne: false
  referencedRelation: Ref
  referencedColumns: ["id"]
}

type Table<Row, DefaultKeys extends keyof Row, R extends readonly unknown[] = []> = {
  Row: Row
  Insert: Defaulted<Row, DefaultKeys>
  Update: Partial<Row>
  Relationships: R
}

export type Database = {
  public: {
    Tables: {
      organizations: Table<
        OrganizationRow,
        "id" | "currency" | "tax_rate" | "tax_label" | "country" | "locale" | "timezone" | "created_at"
      >
      memberships: Table<MembershipRow, "role" | "created_at">
      document_sequences: Table<DocumentSequenceRow, "next_value">
      products: Table<
        ProductRow,
        | "id"
        | "description"
        | "grade"
        | "concentration_pct"
        | "substance_id"
        | "base_uom"
        | "density_kg_per_l"
        | "cost_price"
        | "list_price"
        | "reorder_point"
        | "reorder_qty"
        | "is_batch_tracked"
        | "shelf_life_days"
        | "qty_on_hand"
        | "qty_reserved"
        | "is_active"
        | "created_at"
        | "updated_at"
      >
      package_types: Table<
        PackageTypeRow,
        "id" | "tare_kg" | "is_default" | "created_at",
        [Rel<"package_types_product_id_fkey", "product_id", "products">]
      >
      batches: Table<
        BatchRow,
        "id" | "mfg_date" | "expiry_date" | "qty_on_hand" | "qty_reserved" | "created_at",
        [Rel<"batches_product_id_fkey", "product_id", "products">]
      >
      stock_moves: Table<
        StockMoveRow,
        | "id"
        | "batch_id"
        | "entered_qty"
        | "entered_uom"
        | "unit_cost"
        | "ref_type"
        | "ref_id"
        | "reverses_id"
        | "agent_action_id"
        | "created_by"
        | "created_at",
        [
          Rel<"stock_moves_product_id_fkey", "product_id", "products">,
          Rel<"stock_moves_batch_id_fkey", "batch_id", "batches">,
        ]
      >
      customers: Table<
        CustomerRow,
        | "id"
        | "email"
        | "phone"
        | "billing_address"
        | "delivery_address"
        | "tax_id"
        | "payment_terms_days"
        | "credit_limit"
        | "notes"
        | "is_active"
        | "created_at"
      >
      suppliers: Table<
        SupplierRow,
        | "id"
        | "email"
        | "phone"
        | "billing_address"
        | "tax_id"
        | "payment_terms_days"
        | "notes"
        | "is_active"
        | "created_at"
      >
      sales_orders: Table<
        SalesOrderRow,
        | "id"
        | "customer_id"
        | "customer_ref"
        | "status"
        | "source"
        | "order_date"
        | "requested_date"
        | "currency"
        | "subtotal"
        | "tax"
        | "total"
        | "notes"
        | "needs_review"
        | "created_by"
        | "created_at"
        | "updated_at",
        [Rel<"sales_orders_customer_id_fkey", "customer_id", "customers">]
      >
      sales_order_lines: Table<
        SalesOrderLineRow,
        | "id"
        | "product_id"
        | "description_raw"
        | "package_type_id"
        | "package_count"
        | "unit_price"
        | "line_total"
        | "batch_id"
        | "qty_allocated"
        | "match_confidence"
        | "needs_review"
        | "notes",
        [
          Rel<"sales_order_lines_order_id_fkey", "order_id", "sales_orders">,
          Rel<"sales_order_lines_product_id_fkey", "product_id", "products">,
          Rel<"sales_order_lines_batch_id_fkey", "batch_id", "batches">,
        ]
      >
      purchase_orders: Table<
        PurchaseOrderRow,
        | "id"
        | "supplier_id"
        | "status"
        | "source"
        | "order_date"
        | "expected_date"
        | "currency"
        | "subtotal"
        | "tax"
        | "total"
        | "notes"
        | "created_by"
        | "created_at"
        | "updated_at",
        [Rel<"purchase_orders_supplier_id_fkey", "supplier_id", "suppliers">]
      >
      purchase_order_lines: Table<
        PurchaseOrderLineRow,
        | "id"
        | "package_type_id"
        | "unit_cost"
        | "line_total"
        | "qty_received"
        | "lot_code"
        | "expiry_date",
        [
          Rel<"purchase_order_lines_order_id_fkey", "order_id", "purchase_orders">,
          Rel<"purchase_order_lines_product_id_fkey", "product_id", "products">,
        ]
      >
      invoices: Table<
        InvoiceRow,
        | "id"
        | "order_id"
        | "customer_id"
        | "status"
        | "issue_date"
        | "due_date"
        | "currency"
        | "subtotal"
        | "tax"
        | "total"
        | "amount_paid"
        | "pdf_path"
        | "sent_at"
        | "paid_at"
        | "notes"
        | "created_by"
        | "created_at",
        [
          Rel<"invoices_order_id_fkey", "order_id", "sales_orders">,
          Rel<"invoices_customer_id_fkey", "customer_id", "customers">,
        ]
      >
      invoice_lines: Table<
        InvoiceLineRow,
        "id" | "product_id" | "unit_price" | "line_total",
        [
          Rel<"invoice_lines_invoice_id_fkey", "invoice_id", "invoices">,
          Rel<"invoice_lines_product_id_fkey", "product_id", "products">,
        ]
      >
      agent_runs: Table<
        AgentRunRow,
        | "id"
        | "trigger"
        | "status"
        | "model"
        | "input_ref"
        | "tokens_in"
        | "tokens_out"
        | "cost_usd"
        | "error"
        | "started_at"
        | "ended_at"
      >
      agent_actions: Table<
        AgentActionRow,
        | "id"
        | "run_id"
        | "args"
        | "risk"
        | "actor"
        | "status"
        | "result"
        | "error"
        | "summary"
        | "proposed_at"
        | "requested_by"
        | "approved_by"
        | "approved_at"
        | "rejected_reason"
        | "executed_at"
        | "reverted_at"
        | "reverted_by"
      >
      autonomy_policies: Table<AutonomyPolicyRow, "id" | "mode" | "threshold_amount" | "updated_at">
      inbound_documents: Table<
        InboundDocumentRow,
        | "id"
        | "from_address"
        | "subject"
        | "storage_path"
        | "mime"
        | "body_text"
        | "status"
        | "extracted"
        | "agent_run_id"
        | "sales_order_id"
        | "error"
        | "created_by"
        | "created_at"
      >
      customer_product_aliases: Table<
        CustomerProductAliasRow,
        "id" | "customer_id" | "package_type_id" | "hit_count" | "created_by" | "created_at",
        [
          Rel<"customer_product_aliases_customer_id_fkey", "customer_id", "customers">,
          Rel<"customer_product_aliases_product_id_fkey", "product_id", "products">,
        ]
      >
    }
    Views: Record<never, never>
    Functions: {
      is_org_member: { Args: { target: string }; Returns: boolean }
      has_org_role: { Args: { target: string; roles: string[] }; Returns: boolean }
      next_document_number: { Args: { p_org: string; p_kind: DocumentKind }; Returns: string }
      post_stock_move: {
        Args: {
          p_org: string
          p_product: string
          p_direction: StockDirection
          p_qty: number
          p_reason: StockReason
          p_batch?: string | null
          p_lot_code?: string | null
          p_expiry?: string | null
          p_unit_cost?: number | null
          p_entered_qty?: number | null
          p_entered_uom?: string | null
          p_ref_type?: string | null
          p_ref_id?: string | null
          p_agent_action?: string | null
          p_release_reserved?: boolean
          p_reverses?: string | null
        }
        Returns: string
      }
      reverse_stock_move: { Args: { p_move: string }; Returns: string }
      recalc_sales_order_totals: { Args: { p_order: string }; Returns: undefined }
      create_sales_order: {
        Args: { p_org: string; p_header: Json; p_lines: Json }
        Returns: string
      }
      allocate_sales_order: { Args: { p_order: string }; Returns: undefined }
      fulfil_sales_order: { Args: { p_order: string }; Returns: undefined }
      cancel_sales_order: { Args: { p_order: string }; Returns: undefined }
      create_invoice_from_order: { Args: { p_order: string }; Returns: string }
      create_purchase_order: {
        Args: { p_org: string; p_header: Json; p_lines: Json }
        Returns: string
      }
      receive_purchase_order: { Args: { p_order: string }; Returns: undefined }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

