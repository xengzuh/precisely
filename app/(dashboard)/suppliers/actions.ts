"use server"

import { revalidatePath } from "next/cache"
import { getSupabase } from "@/lib/supabase/server"

export async function addSupplier(formData: FormData): Promise<void> {
  const name = formData.get("name")?.toString().trim() ?? ""
  const email = formData.get("email")?.toString().trim() || null
  const phone = formData.get("phone")?.toString().trim() || null

  if (!name) throw new Error("Name is required")

  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("suppliers")
    .insert({ name, email, phone, user_id: user.id })

  if (error) throw new Error(error.message)

  revalidatePath("/suppliers")
}
