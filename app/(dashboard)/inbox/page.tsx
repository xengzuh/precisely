import Link from "next/link"
import { redirect } from "next/navigation"
import { IntakeForm } from "@/components/inbox/IntakeForm"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { hasApiKey } from "@/lib/ai/client"
import { getUserContext, NoOrganizationError } from "@/lib/erp/actions/context"
import { formatDate } from "@/lib/erp/format"
import { getOrganization } from "@/lib/erp/queries"
import type { InboundDocumentRow, InboundStatus, OrganizationRow } from "@/types/database"

export const dynamic = "force-dynamic"

const STATUS_VARIANT: Record<InboundStatus, "outline" | "secondary" | "default" | "destructive"> = {
  received: "outline",
  parsing: "secondary",
  parsed: "secondary",
  applied: "default",
  failed: "destructive",
  discarded: "outline",
}

export default async function InboxPage() {
  let documents: InboundDocumentRow[]
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [docsResult, orgRow] = await Promise.all([
      ctx.db
        .from("inbound_documents")
        .select("*")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(50),
      getOrganization(ctx),
    ])

    if (docsResult.error) throw new Error(docsResult.error.message)
    documents = docsResult.data ?? []
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load the inbox: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Drop in a customer&apos;s purchase order and the intake agent turns it into a draft
          sales order. Lines it cannot match with confidence are flagged rather than guessed.
        </p>
      </div>

      <IntakeForm configured={hasApiKey()} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Documents</h2>
        <div className="overflow-hidden rounded-xl border">
          {documents.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing processed yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="hidden md:table-cell">From</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.subject ?? "Untitled"}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {doc.from_address ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.source}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[doc.status]}>{doc.status}</Badge>
                      {doc.error && (
                        <span className="block max-w-[18rem] truncate text-xs text-destructive">
                          {doc.error}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                      {formatDate(doc.created_at.slice(0, 10), org)}
                    </TableCell>
                    <TableCell>
                      {doc.sales_order_id && (
                        <Link
                          href={`/orders/${doc.sales_order_id}`}
                          className="text-xs underline underline-offset-2"
                        >
                          Order
                        </Link>
                      )}
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
