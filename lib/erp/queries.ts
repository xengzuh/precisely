import type { ActionContext } from "@/lib/erp/actions/types"
import { emailDomain, isFreemailDomain, parseEmailAddress } from "@/lib/erp/email"
import type {
  AgentActionRow,
  AgentRunRow,
  AutonomyPolicyRow,
  CustomerListItem,
  CustomerRow,
  InvoiceDetail,
  InvoiceListItem,
  OrganizationRow,
  ProductDetail,
  ProductListItem,
  PurchaseOrderListItem,
  SalesOrderDetail,
  SalesOrderListItem,
  StockMovement,
} from "@/lib/types"
import type { Uom } from "@/types/database"

/**
 * Read models for the dashboard pages.
 *
 * These are plain reads and deliberately do not go through the action registry
 * — that gates and audits *writes*. Every query still filters on `ctx.orgId`,
 * which is what keeps them correct on the agent path where RLS is bypassed.
 */

type BatchSlice = {
  qty_on_hand: number
  qty_reserved: number
  expiry_date: string | null
}

function summarize(
  product: { qty_on_hand: number; qty_reserved: number; is_batch_tracked: boolean },
  batches: BatchSlice[]
) {
  if (!product.is_batch_tracked) {
    return {
      onHand: product.qty_on_hand,
      reserved: product.qty_reserved,
      available: product.qty_on_hand - product.qty_reserved,
      nextExpiry: null as string | null,
    }
  }

  const onHand = batches.reduce((sum, b) => sum + b.qty_on_hand, 0)
  const reserved = batches.reduce((sum, b) => sum + b.qty_reserved, 0)
  const nextExpiry =
    batches
      .filter((b) => b.qty_on_hand > 0 && b.expiry_date)
      .map((b) => b.expiry_date as string)
      .sort()[0] ?? null

  return { onHand, reserved, available: onHand - reserved, nextExpiry }
}

export async function listProducts(ctx: ActionContext): Promise<ProductListItem[]> {
  const { data, error } = await ctx.db
    .from("products")
    .select(
      "id, sku, name, grade, concentration_pct, base_uom, density_kg_per_l, cost_price, list_price, reorder_point, is_batch_tracked, qty_on_hand, qty_reserved, created_at, batches(qty_on_hand, qty_reserved, expiry_date)"
    )
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .order("name")

  if (error) throw new Error(error.message)

  return (data ?? []).map((p) => {
    const totals = summarize(p, (p.batches ?? []) as BatchSlice[])
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      grade: p.grade,
      concentration_pct: p.concentration_pct,
      base_uom: p.base_uom,
      density_kg_per_l: p.density_kg_per_l,
      cost_price: p.cost_price,
      list_price: p.list_price,
      reorder_point: p.reorder_point,
      is_batch_tracked: p.is_batch_tracked,
      created_at: p.created_at,
      ...totals,
    }
  })
}

/** Barcode lookup. Returns the same read model as the list, availability included. */
export async function findProductBySku(
  ctx: ActionContext,
  sku: string
): Promise<ProductListItem | null> {
  const products = await listProducts(ctx)
  return products.find((p) => p.sku === sku) ?? null
}

/** Products at or below their reorder point — the low-stock banner and the reorder agent. */
export async function listLowStock(ctx: ActionContext): Promise<ProductListItem[]> {
  const products = await listProducts(ctx)
  return products
    .filter((p) => p.reorder_point !== null && p.available <= p.reorder_point)
    .sort((a, b) => a.available - b.available)
}

export async function listStockMovements(
  ctx: ActionContext,
  limit = 100,
  productId?: string
): Promise<StockMovement[]> {
  let query = ctx.db
    .from("stock_moves")
    .select(
      "id, direction, qty, entered_qty, entered_uom, unit_cost, reason, ref_type, created_at, products(name, sku, base_uom), batches(lot_code)"
    )
    .eq("org_id", ctx.orgId)

  if (productId) query = query.eq("product_id", productId)

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  return (data ?? []).map((m) => ({
    id: m.id,
    direction: m.direction,
    qty: m.qty,
    entered_qty: m.entered_qty,
    entered_uom: m.entered_uom,
    unit_cost: m.unit_cost,
    reason: m.reason,
    ref_type: m.ref_type,
    created_at: m.created_at,
    productName: m.products?.name ?? null,
    productSku: m.products?.sku ?? null,
    baseUom: (m.products?.base_uom ?? "ea") as Uom,
    lotCode: m.batches?.lot_code ?? null,
  }))
}

export async function listPurchaseOrders(ctx: ActionContext): Promise<PurchaseOrderListItem[]> {
  const { data, error } = await ctx.db
    .from("purchase_orders")
    .select(
      "id, order_no, status, order_date, expected_date, total, currency, suppliers(name), purchase_order_lines(id)"
    )
    .eq("org_id", ctx.orgId)
    .order("order_date", { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((o) => ({
    id: o.id,
    order_no: o.order_no,
    status: o.status,
    order_date: o.order_date,
    expected_date: o.expected_date,
    total: o.total,
    currency: o.currency,
    supplierName: o.suppliers?.name ?? null,
    lineCount: (o.purchase_order_lines ?? []).length,
  }))
}

export async function listSalesOrders(
  ctx: ActionContext,
  customerId?: string
): Promise<SalesOrderListItem[]> {
  let query = ctx.db
    .from("sales_orders")
    .select(
      "id, order_no, status, source, order_date, total, currency, needs_review, customers(name), sales_order_lines(id)"
    )
    .eq("org_id", ctx.orgId)

  if (customerId) query = query.eq("customer_id", customerId)

  const { data, error } = await query.order("order_date", { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((o) => ({
    id: o.id,
    order_no: o.order_no,
    status: o.status,
    source: o.source,
    order_date: o.order_date,
    total: o.total,
    currency: o.currency,
    needs_review: o.needs_review,
    customerName: o.customers?.name ?? null,
    lineCount: (o.sales_order_lines ?? []).length,
  }))
}

/**
 * A product with everything the detail page shows: how it ships, which lots
 * hold its stock, and its ledger.
 */
export async function getProductDetail(
  ctx: ActionContext,
  productId: string
): Promise<ProductDetail | null> {
  const { data, error } = await ctx.db
    .from("products")
    .select("*, package_types(*), batches(*)")
    .eq("id", productId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { package_types, batches, ...product } = data
  const moves = await listStockMovements(ctx, 50, productId)

  return {
    ...product,
    packageTypes: (package_types ?? []).sort((a, b) => a.qty_per_package - b.qty_per_package),
    // Expiry-first: this is the order stock will actually be consumed in under
    // FEFO, so it is the order someone checking the shelf wants to read.
    batches: (batches ?? [])
      .slice()
      .sort((a, b) => (a.expiry_date ?? "9999-99-99").localeCompare(b.expiry_date ?? "9999-99-99")),
    moves,
    ...summarize(product, (batches ?? []) as BatchSlice[]),
  }
}

/** Org settings — currency, locale, tax rate. Cheap enough to fetch per page. */
export async function getOrganization(ctx: ActionContext): Promise<OrganizationRow> {
  const { data, error } = await ctx.db
    .from("organizations")
    .select("*")
    .eq("id", ctx.orgId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

/** An invoice is overdue once its due date has passed with money still owed. */
function invoiceStanding(invoice: {
  status: string
  due_date: string | null
  total: number
  amount_paid: number
}) {
  const balance = invoice.total - invoice.amount_paid
  const past =
    invoice.due_date !== null && invoice.due_date < new Date().toISOString().slice(0, 10)

  return {
    balance,
    isOverdue: balance > 0 && past && invoice.status !== "void" && invoice.status !== "paid",
  }
}

export async function listCustomers(ctx: ActionContext): Promise<CustomerListItem[]> {
  const { data, error } = await ctx.db
    .from("customers")
    .select(
      "id, name, email, phone, payment_terms_days, credit_limit, created_at, sales_orders(id), invoices(status, total, amount_paid)"
    )
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .order("name")

  if (error) throw new Error(error.message)

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    payment_terms_days: c.payment_terms_days,
    credit_limit: c.credit_limit,
    created_at: c.created_at,
    orderCount: (c.sales_orders ?? []).length,
    outstanding: (c.invoices ?? [])
      .filter((i) => i.status !== "void" && i.status !== "paid")
      .reduce((sum, i) => sum + (i.total - i.amount_paid), 0),
  }))
}

/**
 * Resolve an email sender to a customer, without involving a model.
 *
 * An address is an exact fact; a company name in a message body is an
 * inference. Doing this in code removes a whole class of misidentification —
 * and because learned product aliases are scoped per customer, it is also what
 * makes them available at all on the email path.
 */
export async function findCustomerByEmail(
  ctx: ActionContext,
  fromHeader: string | null
): Promise<CustomerRow | null> {
  const address = parseEmailAddress(fromHeader)
  if (!address) return null

  const { data: exact, error } = await ctx.db
    .from("customers")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .ilike("email", address)
    .limit(1)

  if (error) throw new Error(error.message)
  if (exact && exact.length > 0) return exact[0]

  // Buyers rarely mail from the address on file — the record says
  // orders@acme.com and the message comes from ahmad@acme.com. A domain match
  // is safe only when it is unambiguous and the domain actually identifies a
  // company; matching on gmail.com would attach one buyer's order to another.
  const domain = emailDomain(address)
  if (!domain || isFreemailDomain(domain)) return null

  const { data: byDomain, error: domainError } = await ctx.db
    .from("customers")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .ilike("email", `%@${domain}`)
    .limit(2)

  if (domainError) throw new Error(domainError.message)
  // Exactly one, or it is a guess rather than a resolution.
  return byDomain && byDomain.length === 1 ? byDomain[0] : null
}

/** Named for the id lookup to keep it distinct from the getCustomer *action*, which searches by name. */
export async function getCustomerById(
  ctx: ActionContext,
  customerId: string
): Promise<CustomerRow | null> {
  const { data, error } = await ctx.db
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

/**
 * A sales order with everything the detail page renders: the customer, each
 * line joined to its product and reserved lot, and the invoice if one exists.
 */
export async function getSalesOrderDetail(
  ctx: ActionContext,
  orderId: string
): Promise<SalesOrderDetail | null> {
  const { data, error } = await ctx.db
    .from("sales_orders")
    .select(
      "*, customers(*), invoices(id, invoice_no), sales_order_lines(id, line_no, product_id, description_raw, qty, uom, unit_price, line_total, qty_allocated, match_confidence, needs_review, notes, products(name, sku, base_uom, is_batch_tracked), batches(lot_code, expiry_date))"
    )
    .eq("id", orderId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { customers, invoices, sales_order_lines, ...order } = data
  const invoice = (invoices ?? [])[0] ?? null

  return {
    ...order,
    customer: customers,
    invoiceId: invoice?.id ?? null,
    invoiceNo: invoice?.invoice_no ?? null,
    lines: (sales_order_lines ?? [])
      .map((l) => ({
        id: l.id,
        line_no: l.line_no,
        qty: l.qty,
        uom: l.uom,
        unit_price: l.unit_price,
        line_total: l.line_total,
        qty_allocated: l.qty_allocated,
        description_raw: l.description_raw,
        match_confidence: l.match_confidence,
        needs_review: l.needs_review,
        notes: l.notes,
        productId: l.product_id,
        productName: l.products?.name ?? null,
        productSku: l.products?.sku ?? null,
        baseUom: (l.products?.base_uom ?? null) as Uom | null,
        isBatchTracked: l.products?.is_batch_tracked ?? false,
        lotCode: l.batches?.lot_code ?? null,
        lotExpiry: l.batches?.expiry_date ?? null,
      }))
      .sort((a, b) => a.line_no - b.line_no),
  }
}

export async function listInvoices(
  ctx: ActionContext,
  customerId?: string
): Promise<InvoiceListItem[]> {
  let query = ctx.db
    .from("invoices")
    .select(
      "id, invoice_no, status, issue_date, due_date, currency, total, amount_paid, customers(name), sales_orders(order_no)"
    )
    .eq("org_id", ctx.orgId)

  if (customerId) query = query.eq("customer_id", customerId)

  const { data, error } = await query.order("issue_date", { ascending: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map((i) => ({
    id: i.id,
    invoice_no: i.invoice_no,
    status: i.status,
    issue_date: i.issue_date,
    due_date: i.due_date,
    currency: i.currency,
    total: i.total,
    amount_paid: i.amount_paid,
    customerName: i.customers?.name ?? null,
    orderNo: i.sales_orders?.order_no ?? null,
    ...invoiceStanding(i),
  }))
}

export async function getInvoiceDetail(
  ctx: ActionContext,
  invoiceId: string
): Promise<InvoiceDetail | null> {
  const { data, error } = await ctx.db
    .from("invoices")
    .select(
      "*, customers(*), sales_orders(order_no), invoice_lines(id, line_no, description, qty, uom, unit_price, line_total, products(sku))"
    )
    .eq("id", invoiceId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { customers, sales_orders, invoice_lines, ...invoice } = data

  return {
    ...invoice,
    customer: customers,
    orderNo: sales_orders?.order_no ?? null,
    lines: (invoice_lines ?? [])
      .map((l) => ({
        id: l.id,
        line_no: l.line_no,
        description: l.description,
        qty: l.qty,
        uom: l.uom,
        unit_price: l.unit_price,
        line_total: l.line_total,
        productSku: l.products?.sku ?? null,
      }))
      .sort((a, b) => a.line_no - b.line_no),
    ...invoiceStanding(invoice),
  }
}

/** Actions an agent has proposed and a human has not yet ruled on. */
export async function listPendingActions(ctx: ActionContext): Promise<AgentActionRow[]> {
  const { data, error } = await ctx.db
    .from("agent_actions")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("status", "proposed")
    .order("proposed_at", { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Recently decided actions — the audit trail behind the inbox. */
export async function listRecentActions(
  ctx: ActionContext,
  limit = 50
): Promise<AgentActionRow[]> {
  const { data, error } = await ctx.db
    .from("agent_actions")
    .select("*")
    .eq("org_id", ctx.orgId)
    .neq("status", "proposed")
    .order("proposed_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listAgentRuns(ctx: ActionContext, limit = 25): Promise<AgentRunRow[]> {
  const { data, error } = await ctx.db
    .from("agent_runs")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("started_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listAutonomyPolicies(
  ctx: ActionContext
): Promise<AutonomyPolicyRow[]> {
  const { data, error } = await ctx.db
    .from("autonomy_policies")
    .select("*")
    .eq("org_id", ctx.orgId)

  if (error) throw new Error(error.message)
  return data ?? []
}

export type DashboardMetrics = {
  revenue: number
  cogs: number
  grossMargin: number
  purchaseSpend: number
  lowStockCount: number
  dailyRevenue: { date: string; revenue: number }[]
}

/**
 * Headline figures, derived from the stock ledger.
 *
 * Margin is revenue minus cost of goods *sold*, using each product's cost
 * price. The previous dashboard subtracted all purchase spend in the period
 * from revenue and called it net profit, which is a cash-flow difference — it
 * showed a loss in any month with a big restock.
 */
export async function getDashboardMetrics(
  ctx: ActionContext,
  sinceDays = 30
): Promise<DashboardMetrics> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()

  const [movesResult, lowStock] = await Promise.all([
    ctx.db
      .from("stock_moves")
      .select("qty, unit_cost, reason, direction, created_at, products(cost_price)")
      .eq("org_id", ctx.orgId)
      .gte("created_at", since),
    listLowStock(ctx),
  ])

  if (movesResult.error) throw new Error(movesResult.error.message)

  let revenue = 0
  let cogs = 0
  let purchaseSpend = 0
  const byDay = new Map<string, number>()

  for (const move of movesResult.data ?? []) {
    const value = move.qty * (move.unit_cost ?? 0)

    if (move.reason === "sale" && move.direction === "out") {
      revenue += value
      cogs += move.qty * (move.products?.cost_price ?? 0)
      const day = move.created_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + value)
    } else if (move.reason === "purchase" && move.direction === "in") {
      purchaseSpend += value
    }
  }

  // Zero-fill so the chart shows a continuous series rather than collapsing
  // quiet days out of the axis.
  const dailyRevenue: { date: string; revenue: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    dailyRevenue.push({ date, revenue: byDay.get(date) ?? 0 })
  }

  return {
    revenue,
    cogs,
    grossMargin: revenue - cogs,
    purchaseSpend,
    lowStockCount: lowStock.length,
    dailyRevenue,
  }
}
