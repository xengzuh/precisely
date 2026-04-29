"use client"

import Link from "next/link"
import { Download, ShoppingCart } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type SaleRow = {
  id: string
  quantity: number
  total_price: number
  type: string
  created_at: string
  products: { name: string } | null
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })
}

function exportCsv(rows: SaleRow[]) {
  const header = "Date,Product Name,Quantity,Total Price,Type"
  const lines = rows.map((r) =>
    [
      `"${fmtDate(r.created_at)}"`,
      `"${r.products?.name ?? ""}"`,
      r.quantity,
      Number(r.total_price).toFixed(2),
      r.type,
    ].join(",")
  )
  const csv = [header, ...lines].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "sales.csv"
  a.click()
  URL.revokeObjectURL(url)
}

export function SalesTable({ rows }: { rows: SaleRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Sales</h1>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => exportCsv(rows)}>
            <Download className="size-4" />
            Export CSV
          </Button>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Type</TableHead>
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
                      <p className="text-sm font-medium">No transactions yet</p>
                      <p className="text-xs text-muted-foreground">
                        Sales and purchases will appear here once recorded.
                      </p>
                    </div>
                    <Link
                      href="/inventory"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Go to Inventory to Sell
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.products?.name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">
                  RM {Number(row.total_price).toFixed(2)}
                </TableCell>
                <TableCell>
                  <span className="capitalize text-sm">{row.type}</span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {fmtDate(row.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
