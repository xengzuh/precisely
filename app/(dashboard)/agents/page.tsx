import { Bot, Inbox, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ProposalCard } from "@/components/agents/ProposalCard"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { formatDate } from "@/lib/erp/format"
import {
  getOrganization,
  listAgentRuns,
  listPendingActions,
  listRecentActions,
} from "@/lib/erp/queries"
import type { AgentActionRow, AgentRunRow, OrganizationRow } from "@/lib/types"

export const dynamic = "force-dynamic"

const STATUS_VARIANT = {
  executed: "default",
  approved: "secondary",
  rejected: "outline",
  failed: "destructive",
  reverted: "outline",
  proposed: "secondary",
} as const

export default async function AgentsPage() {
  let pending: AgentActionRow[]
  let recent: AgentActionRow[]
  let runs: AgentRunRow[]
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [pendingRows, recentRows, runRows, orgRow] = await Promise.all([
      listPendingActions(ctx),
      listRecentActions(ctx),
      listAgentRuns(ctx),
      getOrganization(ctx),
    ])
    pending = pendingRows
    recent = recentRows
    runs = runRows
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load agent activity: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  const spend = runs.reduce((sum, r) => sum + r.cost_usd, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Agents</h1>
        <Link
          href="/agents/policies"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <SlidersHorizontal className="size-4" />
          Autonomy policies
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{pending.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Runs recorded</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{runs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Model spend</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">${spend.toFixed(4)}</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Awaiting approval</h2>
        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border px-4 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((action) => (
              <ProposalCard key={action.id} action={action} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Recent decisions</h2>
        <div className="overflow-hidden rounded-xl border">
          {recent.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No actions decided yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden md:table-cell">Summary</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.action}</TableCell>
                    <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">
                      {a.summary ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.actor}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
                      {a.rejected_reason && (
                        <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">
                          {a.rejected_reason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                      {formatDate(a.proposed_at.slice(0, 10), org)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Runs</h2>
        <div className="overflow-hidden rounded-xl border">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <Bot className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No agent has run yet. Drop a purchase order into the Inbox to start one.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="hidden lg:table-cell">Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Tokens</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Cache</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.agent}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.trigger}</Badge>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                      {r.model ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                      {r.error && (
                        <span className="block max-w-[20rem] truncate text-xs text-destructive">
                          {r.error}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {(r.tokens_in + r.tokens_out).toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {/* Written but never read means the prefix expired before the
                          next document arrived — the cache is costing, not saving. */}
                      {r.cache_read_tokens > 0 ? (
                        <span className="text-muted-foreground">
                          {r.cache_read_tokens.toLocaleString()} read
                        </span>
                      ) : r.cache_write_tokens > 0 ? (
                        <span className="text-amber-600">written, unused</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${r.cost_usd.toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  )
}
