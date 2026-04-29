"use server"

import { revalidatePath } from "next/cache"
import { getSupabase } from "@/lib/supabase/server"

export async function addProduct(formData: FormData): Promise<void> {
  const name = formData.get("name")?.toString().trim() ?? ""
  const sku = formData.get("sku")?.toString().trim() ?? ""
  const stock = parseInt(formData.get("stock")?.toString() ?? "0", 10)
  const price = parseFloat(formData.get("price")?.toString() ?? "0")

  if (!name) throw new Error("Name is required")
  if (!sku) throw new Error("SKU is required")
  if (isNaN(stock) || stock < 0) throw new Error("Stock must be 0 or more")
  if (isNaN(price) || price <= 0) throw new Error("Price must be greater than 0")

  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("products")
    .insert({ name, sku, stock, price, user_id: user.id })

  if (error) {
    if (error.code === "23505") throw new Error(`SKU "${sku}" is already taken`)
    throw new Error(error.message)
  }

  revalidatePath("/inventory")
}

export async function sellProduct(productId: string, quantity: number): Promise<void> {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: row, error: fetchError } = await supabase
    .from("products")
    .select("stock, price")
    .eq("id", productId)
    .single()

  if (fetchError || !row) throw new Error("Product not found")

  const { stock, price } = row as { stock: number; price: number }

  if (stock < quantity) {
    throw new Error(`Insufficient stock — only ${stock} unit(s) available`)
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ stock: stock - quantity })
    .eq("id", productId)

  if (updateError) throw new Error(updateError.message)

  const { error: txError } = await supabase.from("transactions").insert({
    product_id: productId,
    quantity,
    total_price: Number(price) * quantity,
    type: "sale",
    user_id: user.id,
  })

  if (txError) throw new Error(txError.message)

  revalidatePath("/inventory")
  revalidatePath("/sales")
}

export async function quickStockIn(productId: string): Promise<void> {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: row, error: fetchError } = await supabase
    .from("products")
    .select("stock, price")
    .eq("id", productId)
    .single()

  if (fetchError || !row) throw new Error("Product not found")

  const { stock, price } = row as { stock: number; price: number }

  const { error: updateError } = await supabase
    .from("products")
    .update({ stock: stock + 1 })
    .eq("id", productId)

  if (updateError) throw new Error(updateError.message)

  const { error: txError } = await supabase.from("transactions").insert({
    product_id: productId,
    quantity: 1,
    total_price: Number(price),
    type: "purchase",
    user_id: user.id,
  })

  if (txError) throw new Error(txError.message)

  revalidatePath("/inventory")
  revalidatePath("/scanner")
  revalidatePath("/dashboard")
}

export async function getProductBySku(sku: string): Promise<import("@/lib/types").Product | null> {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("sku", sku)
    .single()

  return (data as import("@/lib/types").Product | null) ?? null
}
