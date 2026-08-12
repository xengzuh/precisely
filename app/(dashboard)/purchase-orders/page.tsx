import { redirect } from "next/navigation"
import { PurchaseOrdersTable } from "@/components/purchase-orders-table"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { listProducts, listPurchaseOrders } from "@/lib/erp/queries"
import type { ProductListItem, PurchaseOrderListItem, Supplier } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>
}) {
  const params = await searchParams
  const defaultProductId = params.product ?? null

  let orders: PurchaseOrderListItem[]
  let products: ProductListItem[]
  let suppliers: Supplier[]

  try {
    const ctx = await getUserContext()

    const [orderRows, productRows, supplierResult] = await Promise.all([
      listPurchaseOrders(ctx),
      listProducts(ctx),
      ctx.db.from("suppliers").select("*").eq("org_id", ctx.orgId).order("name"),
    ])

    if (supplierResult.error) throw new Error(supplierResult.error.message)

    orders = orderRows
    products = productRows
    suppliers = (supplierResult.data ?? []) as Supplier[]
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load purchase orders:{" "}
        {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  return (
    <PurchaseOrdersTable
      orders={orders}
      suppliers={suppliers}
      products={products}
      defaultProductId={defaultProductId}
    />
  )
}
