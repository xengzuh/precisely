import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { daysUntil, formatDate, type OrgFormat } from "@/lib/erp/format"
import { formatQty } from "@/lib/erp/uom"
import type { ProductDetail } from "@/lib/types"

/** Short-dated stock is stock customers will reject, so flag it early. */
const NEAR_EXPIRY_DAYS = 90

export function BatchList({ product, org }: { product: ProductDetail; org: OrgFormat }) {
  if (!product.is_batch_tracked) return null

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Lots</h2>
      <div className="overflow-hidden rounded-xl border">
        {product.batches.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No lots yet. Receiving a purchase order creates them.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot</TableHead>
                <TableHead className="hidden sm:table-cell">Expiry</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.batches.map((batch) => {
                const available = batch.qty_on_hand - batch.qty_reserved
                const days = daysUntil(batch.expiry_date)
                const expired = days !== null && days < 0
                const nearExpiry = days !== null && days >= 0 && days <= NEAR_EXPIRY_DAYS

                return (
                  <TableRow key={batch.id} className={expired ? "bg-destructive/5" : undefined}>
                    <TableCell className="font-mono text-xs font-medium">
                      {batch.lot_code}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className={expired ? "text-destructive" : undefined}>
                        {formatDate(batch.expiry_date, org)}
                      </span>
                      {expired && (
                        <Badge variant="destructive" className="ml-2">
                          expired
                        </Badge>
                      )}
                      {nearExpiry && (
                        <Badge variant="outline" className="ml-2">
                          {days}d left
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(batch.qty_on_hand, product.base_uom)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {batch.qty_reserved > 0
                        ? formatQty(batch.qty_reserved, product.base_uom)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatQty(available, product.base_uom)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  )
}
