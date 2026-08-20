import { redirect } from "next/navigation"
import { CustomersTable } from "@/components/customers/CustomersTable"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { getOrganization, listCustomers } from "@/lib/erp/queries"
import type { CustomerListItem, OrganizationRow } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function CustomersPage() {
  let customers: CustomerListItem[]
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [customerRows, orgRow] = await Promise.all([listCustomers(ctx), getOrganization(ctx)])
    customers = customerRows
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load customers: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  return <CustomersTable customers={customers} org={org} />
}
