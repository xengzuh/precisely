import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PolicyMatrix, type PolicyRowModel } from "@/components/agents/PolicyMatrix"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { getAgentTools } from "@/lib/erp/actions/registry"
import { listAutonomyPolicies } from "@/lib/erp/queries"

export const dynamic = "force-dynamic"

export default async function PoliciesPage() {
  let policies: PolicyRowModel[]

  try {
    const ctx = await getUserContext()
    const stored = await listAutonomyPolicies(ctx)
    const byAction = new Map(stored.map((p) => [p.action, p]))

    // The registry is the source of truth for which actions exist. An org with
    // no stored policy for an action falls back to that action's own default,
    // which is `approve` unless the action opted out of gating.
    policies = getAgentTools().map((definition) => {
      const policy = byAction.get(definition.name)
      return {
        action: definition.name,
        description: definition.description,
        // risk() needs an input to inspect; the matrix only needs the shape of
        // the action, so probe it with an empty object and fall back.
        risk: safeRisk(definition.risk),
        mode: policy?.mode ?? definition.defaultMode,
        threshold: policy?.threshold_amount ?? null,
        isDefault: !policy,
      }
    })
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load policies: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/agents"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Agents
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Autonomy policies</h1>
        <p className="text-sm text-muted-foreground">
          What agents may do without asking. High-risk actions are always queued for approval
          regardless of the mode set here, and no agent can change this page.
        </p>
      </div>

      <PolicyMatrix policies={policies} />
    </div>
  )
}

/** Risk can depend on the input; with none to hand, report the floor. */
function safeRisk(risk: (input: never, ctx: never) => string): string {
  try {
    return risk({} as never, {} as never)
  } catch {
    return "varies"
  }
}
