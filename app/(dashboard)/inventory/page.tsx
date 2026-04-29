import { getSupabase } from "@/lib/supabase/server"
import { InventoryTable } from "@/components/inventory-table"
import type { Product } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function InventoryPage() {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, stock, price, created_at")
    .order("name")

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load inventory: {error.message}
      </p>
    )
  }

  const products = (data ?? []) as Product[]

  return <InventoryTable products={products} />
}
