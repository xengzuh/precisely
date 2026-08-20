"use client"

import { Download, Package, Plus, ScanLine, ShoppingCart, Upload } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { ScannerModal } from "@/components/barcode-scanner/ScannerModal"
import { ProductFormDialog } from "@/components/inventory/ProductFormDialog"
import { SellDialog } from "@/components/inventory/SellDialog"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatQty } from "@/lib/erp/uom"
import type { ProductListItem } from "@/lib/types"

function describe(p: ProductListItem): string {
  const parts = [p.grade, p.concentration_pct != null ? `${p.concentration_pct}%` : null]
  return parts.filter(Boolean).join(" · ")
}

export function InventoryTable({ products }: { products: ProductListItem[] }) {
  const [addOpen, setAddOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [selected, setSelected] = useState<ProductListItem | null>(null)

  function openSell(product: ProductListItem) {
    setSelected(product)
    setSellOpen(true)
  }

  function handleScanResult(sku: string) {
    setScannerOpen(false)
    const product = products.find((p) => p.sku === sku)
    if (product) {
      openSell(product)
    } else {
      toast.info("Product not found", {
        description: `No product matches SKU "${sku}"`,
        action: { label: "Add Product", onClick: () => setAddOpen(true) },
      })
    }
  }

  function exportCsv() {
    const header = "Name,SKU,Grade,Base UoM,Available,Cost,List,Stock Value"
    const lines = products.map((p) =>
      [
        `"${p.name}"`,
        `"${p.sku}"`,
        `"${p.grade ?? ""}"`,
        p.base_uom,
        p.available,
        Number(p.cost_price).toFixed(4),
        Number(p.list_price).toFixed(4),
        // Valued at cost, not list — stock is an asset, and valuing it at the
        // price you hope to sell it for overstates the balance sheet.
        (p.available * Number(p.cost_price)).toFixed(2),
      ].join(",")
    )
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "inventory.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <div className="flex items-center gap-2">
          {products.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              Export CSV
            </Button>
          )}
          <Link
            href="/inventory/import"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Upload className="size-4" />
            Import CSV
          </Link>
          <Button size="sm" variant="outline" onClick={() => setScannerOpen(true)}>
            <ScanLine className="size-4" />
            Scan Barcode
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
            <Package className="size-10 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No products yet</p>
              <p className="text-xs text-muted-foreground">
                Add your first product to get started.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add Product
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="hidden text-right md:table-cell">Next expiry</TableHead>
                <TableHead className="text-right">List price</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const low = p.reorder_point !== null && p.available <= p.reorder_point
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/inventory/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                      {describe(p) && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {describe(p)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.sku}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${low ? "font-semibold text-destructive" : ""}`}
                    >
                      {formatQty(p.available, p.base_uom)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.reserved > 0 ? formatQty(p.reserved, p.base_uom) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-right text-xs text-muted-foreground md:table-cell">
                      {p.nextExpiry ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      RM {Number(p.list_price).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={p.available <= 0}
                        onClick={() => openSell(p)}
                      >
                        <ShoppingCart className="size-3.5" />
                        Sell
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <ProductFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <SellDialog product={selected} open={sellOpen} onOpenChange={setSellOpen} />
      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
      />
    </div>
  )
}
