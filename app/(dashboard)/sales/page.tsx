import { getSupabase } from "@/lib/supabase/server"
import { SalesTable } from "@/components/sales-table"
import type { SaleRow } from "@/components/sales-table"

export const dynamic = "force-dynamic"

export default async function SalesPage() {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("transactions")
    .select("id, quantity, total_price, type, created_at, products(name)")
    .order("created_at", { ascending: false })

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load transactions: {error.message}
      </p>
    )
  }

  const rows = (data ?? []) as unknown as SaleRow[]

  return <SalesTable rows={rows} />
}
