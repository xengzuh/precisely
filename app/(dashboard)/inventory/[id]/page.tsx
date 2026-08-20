import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { BatchList } from "@/components/inventory/BatchList"
import { PackagingEditor } from "@/components/inventory/PackagingEditor"
import { Badge } from "@/components/ui/badge"
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
import { formatDate, formatMoney } from "@/lib/erp/format"
import { getOrganization, getProductDetail } from "@/lib/erp/queries"
import { formatQty } from "@/lib/erp/uom"
import type { OrganizationRow, ProductDetail } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let product: ProductDetail | null
  let org: OrganizationRow

  try {
    const ctx = await getUserContext()
    const [productRow, orgRow] = await Promise.all([
      getProductDetail(ctx, id),
      getOrganization(ctx),
    ])
    product = productRow
    org = orgRow
  } catch (err) {
    if (err instanceof NoOrganizationError) redirect("/onboarding")
    return (
      <p className="text-sm text-destructive">
        Failed to load product: {err instanceof Error ? err.message : "Unknown error"}
      </p>
    )
  }

  if (!product) notFound()

  const low = product.reorder_point !== null && product.available <= product.reorder_point

  const facts: [string, string][] = [
    ["Available", formatQty(product.available, product.base_uom)],
    ["Reserved", formatQty(product.reserved, product.base_uom)],
    ["Cost price", formatMoney(product.cost_price, org)],
    ["List price", formatMoney(product.list_price, org)],
  ]

  const spec: [string, string][] = [
    ["Grade", product.grade ?? "—"],
    [
      "Concentration",
      product.concentration_pct !== null ? `${product.concentration_pct}%` : "—",
    ],
    [
      "Density",
      product.density_kg_per_l !== null ? `${product.density_kg_per_l} kg/L` : "not set",
    ],
    [
      "Reorder point",
      product.reorder_point !== null ? formatQty(product.reorder_point, product.base_uom) : "—",
    ],
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{product.name}</h1>
            <Badge variant="outline">{product.base_uom}</Badge>
            {product.is_batch_tracked && <Badge variant="secondary">lot tracked</Badge>}
            {low && <Badge variant="destructive">low stock</Badge>}
          </div>
          <p className="font-mono text-sm text-muted-foreground">{product.sku}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-medium tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {spec.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p
                className={`mt-1 text-sm ${
                  // A liquid with no density cannot be ordered in the other
                  // unit — worth flagging on the page rather than failing later.
                  label === "Density" && value === "not set" && product.base_uom !== "ea"
                    ? "text-destructive"
                    : ""
                }`}
              >
                {value}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <PackagingEditor product={product} />

      <BatchList product={product} org={org} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Movements</h2>
        <div className="overflow-hidden rounded-xl border">
          {product.moves.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No movements recorded.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="hidden md:table-cell">Lot</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Unit value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.moves.map((move) => (
                  <TableRow key={move.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(move.created_at.slice(0, 10), org)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={move.direction === "in" ? "secondary" : "outline"}>
                        {move.reason}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                      {move.lotCode ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {move.direction === "in" ? "+" : "−"}
                      {formatQty(move.qty, product.base_uom)}
                      {/* What the operator actually typed, when it differed from
                          the base unit — "5 drums" is more checkable than 1000 L. */}
                      {move.entered_qty !== null && move.entered_uom !== product.base_uom && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          entered as {move.entered_qty} {move.entered_uom}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {move.unit_cost !== null ? formatMoney(move.unit_cost, org) : "—"}
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
