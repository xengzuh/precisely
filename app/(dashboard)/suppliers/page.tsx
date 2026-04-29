import { getSupabase } from "@/lib/supabase/server"
import { SuppliersTable } from "@/components/suppliers-table"
import type { Supplier } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function SuppliersPage() {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, email, phone, created_at")
    .order("name")

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load suppliers: {error.message}
      </p>
    )
  }

  return <SuppliersTable suppliers={(data ?? []) as Supplier[]} />
}
