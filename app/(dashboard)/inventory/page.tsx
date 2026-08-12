import { redirect } from "next/navigation"
import { InventoryTable } from "@/components/inventory-table"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { listProducts } from "@/lib/erp/queries"

export const dynamic = "force-dynamic"

export default async function InventoryPage() {
  let products
  try {
    const ctx = await getUserContext()
    products = await listProducts(ctx)
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load inventory: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  return <InventoryTable products={products} />
}
