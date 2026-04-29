"use server"

import { revalidatePath } from "next/cache"
import { getSupabase } from "@/lib/supabase/server"

export async function addPurchaseOrder({
  supplierId,
  productId,
  quantity,
  unitCost,
}: {
  supplierId: string
  productId: string
  quantity: number
  unitCost: number
}): Promise<void> {
  if (!supplierId) throw new Error("Supplier is required")
  if (!productId) throw new Error("Product is required")
  if (quantity < 1) throw new Error("Quantity must be at least 1")
  if (unitCost <= 0) throw new Error("Unit cost must be greater than 0")

  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase.from("purchase_orders").insert({
    supplier_id: supplierId,
    product_id: productId,
    quantity,
    unit_cost: unitCost,
    status: "pending",
    user_id: user.id,
  })

  if (error) throw new Error(error.message)

  revalidatePath("/purchase-orders")
}

export async function markReceived(orderId: string): Promise<void> {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: row, error: fetchErr } = await supabase
    .from("purchase_orders")
    .select("product_id, quantity, total_cost, status")
    .eq("id", orderId)
    .single()

  if (fetchErr || !row) throw new Error("Order not found")

  const { product_id, quantity, total_cost, status } = row as {
    product_id: string
    quantity: number
    total_cost: number | string
    status: string
  }

  if (status !== "pending") throw new Error("Order is not pending")

  const { error: orderErr } = await supabase
    .from("purchase_orders")
    .update({ status: "received" })
    .eq("id", orderId)

  if (orderErr) throw new Error(orderErr.message)

  const { data: product, error: productErr } = await supabase
    .from("products")
    .select("stock")
    .eq("id", product_id)
    .single()

  if (productErr || !product) throw new Error("Product not found")

  const { error: stockErr } = await supabase
    .from("products")
    .update({ stock: (product as { stock: number }).stock + quantity })
    .eq("id", product_id)

  if (stockErr) throw new Error(stockErr.message)

  const { error: txErr } = await supabase.from("transactions").insert({
    product_id,
    quantity,
    total_price: Number(total_cost),
    type: "purchase",
    user_id: user.id,
  })

  if (txErr) throw new Error(txErr.message)

  revalidatePath("/purchase-orders")
  revalidatePath("/inventory")
  revalidatePath("/dashboard")
}
