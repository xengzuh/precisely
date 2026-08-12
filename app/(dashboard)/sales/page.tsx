import { redirect } from "next/navigation"
import { SalesTable } from "@/components/sales-table"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { listStockMovements } from "@/lib/erp/queries"

export const dynamic = "force-dynamic"

export default async function SalesPage() {
  let rows
  try {
    const ctx = await getUserContext()
    rows = await listStockMovements(ctx, 250)
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load stock movements:{" "}
        {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  return <SalesTable rows={rows} />
}
