"use client"

import { AlertTriangle, Pencil } from "lucide-react"
import { useState } from "react"
import { LineEditDialog } from "@/components/orders/LineEditDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney, type OrgFormat } from "@/lib/erp/format"
import { formatQty } from "@/lib/erp/uom"
import type { ProductListItem, SalesOrderDetail, SalesOrderLineDetail } from "@/lib/types"

export function OrderLinesTable({
  order,
  products,
  org,
}: {
  order: SalesOrderDetail
  products: ProductListItem[]
  org: OrgFormat
}) {
  const [editing, setEditing] = useState<SalesOrderLineDetail | null>(null)
  const editable = order.status === "draft"
  const money = { ...org, currency: order.currency }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="hidden md:table-cell">Lot</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Reserved</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">Total</TableHead>
            {editable && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.lines.map((line) => (
            <TableRow key={line.id} className={line.needs_review ? "bg-destructive/5" : undefined}>
              <TableCell className="text-xs text-muted-foreground">{line.line_no}</TableCell>

              <TableCell>
                {line.productName ? (
                  <>
                    <span className="font-medium">{line.productName}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {line.productSku}
                    </span>
                  </>
                ) : (
                  <>
                    {/* No match: show what the document said, verbatim. Guessing
                        the chemical is how the wrong drum goes on the truck. */}
                    <span className="flex items-center gap-1.5 font-medium text-destructive">
                      <AlertTriangle className="size-3.5" />
                      Unmatched
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {line.description_raw ?? "No description"}
                    </span>
                  </>
                )}
                {line.match_confidence !== null && line.match_confidence < 1 && (
                  <Badge variant="outline" className="mt-1">
                    {Math.round(line.match_confidence * 100)}% match
                  </Badge>
                )}
              </TableCell>

              <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                {line.lotCode ?? "—"}
                {line.lotExpiry && (
                  <span className="block">exp {line.lotExpiry}</span>
                )}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {line.baseUom ? formatQty(line.qty, line.baseUom) : `${line.qty} ${line.uom}`}
              </TableCell>

              <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                {line.qty_allocated > 0
                  ? line.baseUom
                    ? formatQty(line.qty_allocated, line.baseUom)
                    : line.qty_allocated
                  : "—"}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {formatMoney(line.unit_price, money)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(line.line_total, money)}
              </TableCell>

              {editable && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(line)}>
                    <Pencil className="size-3.5" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <LineEditDialog
        line={editing}
        products={products}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </>
  )
}
