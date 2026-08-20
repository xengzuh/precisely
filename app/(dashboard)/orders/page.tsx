import Link from "next/link"
import { redirect } from "next/navigation"
import { SalesOrdersTable } from "@/components/orders/SalesOrdersTable"
import { buttonVariants } from "@/components/ui/button"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { getOrganization, listSalesOrders } from "@/lib/erp/queries"
import { cn } from "@/lib/utils"
import type { OrganizationRow, SalesOrderListItem } from "@/lib/types"
import type { SalesOrderStatus } from "@/types/database"

export const dynamic = "force-dynamic"

const FILTERS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "allocated", label: "Allocated" },
  { value: "invoiced", label: "Invoiced" },
  { value: "all", label: "All" },
]

/** "Open" is everything still needing work — the default view. */
const OPEN: SalesOrderStatus[] = ["draft", "confirmed", "allocated", "fulfilled"]

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status = "open" } = await searchParams

  let orders: SalesOrderListItem[]
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [orderRows, orgRow] = await Promise.all([listSalesOrders(ctx), getOrganization(ctx)])
    orders = orderRows
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load orders: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  const visible =
    status === "all"
      ? orders
      : status === "open"
        ? orders.filter((o) => OPEN.includes(o.status))
        : orders.filter((o) => o.status === status)

  const needsReview = orders.filter((o) => o.needs_review).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Sales Orders</h1>
          {needsReview > 0 && (
            <p className="text-sm text-destructive">
              {needsReview} order{needsReview === 1 ? "" : "s"} need review
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/orders?status=${f.value}`}
            className={cn(
              buttonVariants({ variant: status === f.value ? "default" : "outline", size: "sm" })
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <SalesOrdersTable
          orders={visible}
          org={org}
          emptyMessage={
            status === "all"
              ? "No sales orders yet. The PO intake agent will create them from customer documents."
              : `No ${status} orders.`
          }
        />
      </div>
    </div>
  )
}
