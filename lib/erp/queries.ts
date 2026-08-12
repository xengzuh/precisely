import type { ActionContext } from "@/lib/erp/actions/types"
import type {
  ProductListItem,
  PurchaseOrderListItem,
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
  limit = 100
): Promise<StockMovement[]> {
  const { data, error } = await ctx.db
    .from("stock_moves")
    .select(
      "id, direction, qty, entered_qty, entered_uom, unit_cost, reason, ref_type, created_at, products(name, sku, base_uom), batches(lot_code)"
    )
    .eq("org_id", ctx.orgId)
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

export async function listSalesOrders(ctx: ActionContext): Promise<SalesOrderListItem[]> {
  const { data, error } = await ctx.db
    .from("sales_orders")
    .select(
      "id, order_no, status, source, order_date, total, currency, needs_review, customers(name), sales_order_lines(id)"
    )
    .eq("org_id", ctx.orgId)
    .order("order_date", { ascending: false })

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
