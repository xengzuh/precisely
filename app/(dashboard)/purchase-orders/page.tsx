import { getSupabase } from "@/lib/supabase/server"
import { PurchaseOrdersTable } from "@/components/purchase-orders-table"
import type { Supplier, Product, PurchaseOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>
}) {
  const params = await searchParams
  const defaultProductId = params.product ?? null

  const supabase = await getSupabase()

  const [
    { data: rawOrders },
    { data: rawSuppliers },
    { data: rawProducts },
  ] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, supplier_id, product_id, quantity, unit_cost, total_cost, status, created_at, suppliers(name), products(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("suppliers")
      .select("id, name, email, phone, created_at")
      .order("name"),
    supabase
      .from("products")
      .select("id, name, sku, stock, price, created_at")
      .order("name"),
  ])

  return (
    <PurchaseOrdersTable
      orders={(rawOrders ?? []) as unknown as PurchaseOrder[]}
      suppliers={(rawSuppliers ?? []) as Supplier[]}
      products={(rawProducts ?? []) as Product[]}
      defaultProductId={defaultProductId}
    />
  )
}
