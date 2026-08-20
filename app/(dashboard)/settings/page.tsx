import { redirect } from "next/navigation"
import { OrganizationForm } from "@/components/settings/OrganizationForm"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { getOrganization } from "@/lib/erp/queries"
import type { OrganizationRow } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    org = await getOrganization(ctx)
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load settings: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <OrganizationForm org={org} />
    </div>
  )
}
