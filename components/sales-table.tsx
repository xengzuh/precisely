"use client"

import { Download, ShoppingCart } from "lucide-react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatQty } from "@/lib/erp/uom"
import type { StockMovement } from "@/lib/types"

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })
}

function value(row: StockMovement): number {
  return row.qty * Number(row.unit_cost ?? 0)
}

/** What the operator actually typed, when it differed from the base unit. */
function asEntered(row: StockMovement): string | null {
  if (row.entered_qty == null || !row.entered_uom) return null
  if (row.entered_uom === row.baseUom) return null
  return `${row.entered_qty} × ${row.entered_uom}`
}

function exportCsv(rows: StockMovement[], filename: string) {
  const header = "Date,Product,SKU,Lot,Quantity,Unit,As entered,Unit price,Value,Reason"
  const lines = rows.map((r) =>
    [
      `"${fmtDate(r.created_at)}"`,
      `"${r.productName ?? ""}"`,
      `"${r.productSku ?? ""}"`,
      `"${r.lotCode ?? ""}"`,
      r.qty,
      r.baseUom,
      `"${asEntered(r) ?? ""}"`,
      Number(r.unit_cost ?? 0).toFixed(4),
      value(r).toFixed(2),
      r.reason,
    ].join(",")
  )
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function MovementTable({
  rows,
  emptyLabel,
}: {
  rows: StockMovement[]
  emptyLabel: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="hidden sm:table-cell">Lot</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-14">
                <div className="flex flex-col items-center gap-3 text-center">
                  <ShoppingCart className="size-10 text-muted-foreground/40" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No {emptyLabel} yet</p>
                    <p className="text-xs text-muted-foreground">
                      {emptyLabel === "sales"
                        ? "Sell items from the Inventory page to see them here."
                        : "Receiving a purchase order will record movements here."}
                    </p>
                  </div>
                  <Link
                    href="/inventory"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Go to Inventory
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => {
            const entered = asEntered(row)
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.productName ?? "—"}
                  {row.productSku && (
                    <span className="block font-mono text-xs font-normal text-muted-foreground">
                      {row.productSku}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                  {row.lotCode ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQty(row.qty, row.baseUom)}
                  {entered && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {entered}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  RM {value(row).toFixed(2)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(row.created_at)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function CountBadge({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary">
      {n}
    </span>
  )
}

export function SalesTable({ rows }: { rows: StockMovement[] }) {
  const sales = rows.filter((r) => r.reason === "sale")
  const purchases = rows.filter((r) => r.reason === "purchase")
  // Stocktakes, spillage, and reversals are the movements an auditor asks
  // about, so they get their own tab rather than being folded into sales.
  const adjustments = rows.filter(
    (r) => !["sale", "purchase"].includes(r.reason)
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Stock movements</h1>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">
            Sales
            <CountBadge n={sales.length} />
          </TabsTrigger>
          <TabsTrigger value="purchases">
            Purchases
            <CountBadge n={purchases.length} />
          </TabsTrigger>
          <TabsTrigger value="adjustments">
            Adjustments
            <CountBadge n={adjustments.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4 space-y-3">
          {sales.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => exportCsv(sales, "sales.csv")}>
                <Download className="size-4" />
                Export CSV
              </Button>
            </div>
          )}
          <MovementTable rows={sales} emptyLabel="sales" />
        </TabsContent>

        <TabsContent value="purchases" className="mt-4 space-y-3">
          {purchases.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportCsv(purchases, "purchases.csv")}
              >
                <Download className="size-4" />
                Export CSV
              </Button>
            </div>
          )}
          <MovementTable rows={purchases} emptyLabel="purchases" />
        </TabsContent>

        <TabsContent value="adjustments" className="mt-4 space-y-3">
          {adjustments.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportCsv(adjustments, "adjustments.csv")}
              >
                <Download className="size-4" />
                Export CSV
              </Button>
            </div>
          )}
          <MovementTable rows={adjustments} emptyLabel="adjustments" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
