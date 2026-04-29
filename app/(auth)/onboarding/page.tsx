import { redirect } from "next/navigation"
import { getSupabase } from "@/lib/supabase/server"
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"

export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { count } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })

  if ((count ?? 0) > 0) redirect("/dashboard")

  return <OnboardingWizard />
}
