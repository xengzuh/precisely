"use client"

import { useState } from "react"
import { Plus, ShoppingCart, Package, Loader2, ScanLine, Upload, Download } from "lucide-react"
import Link from "next/link"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addProduct, sellProduct } from "@/app/(dashboard)/inventory/actions"
import { ScannerModal } from "@/components/barcode-scanner/ScannerModal"
import type { Product } from "@/lib/types"

// ── Schemas ──────────────────────────────────────────────────────────────────

const addProductSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  sku: z
    .string()
    .min(3, "SKU must be at least 3 characters")
    .regex(/^\S+$/, "SKU cannot contain spaces"),
  stock: z.coerce
    .number()
    .int("Must be a whole number")
    .min(0, "Must be 0 or more"),
  price: z.coerce.number().min(0.01, "Must be at least 0.01"),
})
type AddProductValues = z.infer<typeof addProductSchema>

const sellSchema = z.object({
  quantity: z.coerce
    .number()
    .int("Must be a whole number")
    .min(1, "Minimum 1"),
})
type SellValues = z.infer<typeof sellSchema>

// ── Component ────────────────────────────────────────────────────────────────

export function InventoryTable({ products }: { products: Product[] }) {
  // ── CSV export ───────────────────────────────────────────────────────────
  function exportCsv() {
    const header = "Name,SKU,Stock,Price,Total Value"
    const lines = products.map((p) =>
      [
        `"${p.name}"`,
        `"${p.sku}"`,
        p.stock,
        Number(p.price).toFixed(2),
        (p.stock * Number(p.price)).toFixed(2),
      ].join(",")
    )
    const csv = [header, ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "inventory.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Scanner ──────────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false)

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

  // ── Add Product dialog ───────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)

  const addForm = useForm<AddProductValues>({
    resolver: zodResolver(addProductSchema) as Resolver<AddProductValues>,
    defaultValues: { name: "", sku: "" },
  })

  async function onAddSubmit(values: AddProductValues) {
    const fd = new FormData()
    fd.set("name", values.name)
    fd.set("sku", values.sku)
    fd.set("stock", String(values.stock))
    fd.set("price", String(values.price))
    try {
      await addProduct(fd)
      setAddOpen(false)
      addForm.reset()
      toast.success("Product added successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add product")
    }
  }

  // ── Sell dialog ──────────────────────────────────────────────────────────
  const [sellOpen, setSellOpen] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)

  const sellForm = useForm<SellValues>({
    resolver: zodResolver(sellSchema) as Resolver<SellValues>,
    defaultValues: { quantity: 1 },
  })

  const watchedQty = sellForm.watch("quantity")
  const totalPreview = (Number(watchedQty) || 0) * Number(selected?.price ?? 0)

  function openSell(product: Product) {
    setSelected(product)
    sellForm.reset({ quantity: 1 })
    setSellOpen(true)
  }

  async function onSellSubmit(values: SellValues) {
    if (!selected) return
    if (values.quantity > selected.stock) {
      sellForm.setError("quantity", {
        message: `Insufficient stock. Only ${selected.stock} units available`,
      })
      return
    }
    try {
      await sellProduct(selected.id, values.quantity)
      setSellOpen(false)
      setSelected(null)
      toast.success("Sale recorded successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sale failed")
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
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

      {/* ── Products table / empty state ── */}
      <div className="rounded-xl border overflow-hidden">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center px-4">
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
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.sku}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    RM {Number(p.price).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={p.stock === 0}
                      onClick={() => openSell(p)}
                    >
                      <ShoppingCart className="size-3.5" />
                      Sell
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Add Product dialog ── */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!addForm.formState.isSubmitting) {
            setAddOpen(o)
            if (!o) addForm.reset()
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-name">Name</Label>
              <Input
                id="ap-name"
                placeholder="e.g. Wireless Keyboard"
                {...addForm.register("name")}
              />
              {addForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {addForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ap-sku">SKU</Label>
              <Input
                id="ap-sku"
                placeholder="e.g. WK-001"
                {...addForm.register("sku")}
              />
              {addForm.formState.errors.sku && (
                <p className="text-xs text-destructive">
                  {addForm.formState.errors.sku.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ap-stock">Stock</Label>
                <Input
                  id="ap-stock"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...addForm.register("stock")}
                />
                {addForm.formState.errors.stock && (
                  <p className="text-xs text-destructive">
                    {addForm.formState.errors.stock.message}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ap-price">Price (RM)</Label>
                <Input
                  id="ap-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  {...addForm.register("price")}
                />
                {addForm.formState.errors.price && (
                  <p className="text-xs text-destructive">
                    {addForm.formState.errors.price.message}
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={addForm.formState.isSubmitting}
              onClick={() => { setAddOpen(false); addForm.reset() }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addForm.formState.isSubmitting}
              onClick={addForm.handleSubmit(onAddSubmit)}
            >
              {addForm.formState.isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" /> Saving…</>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Scanner modal ── */}
      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
      />

      {/* ── Sell dialog ── */}
      <Dialog
        open={sellOpen}
        onOpenChange={(o) => {
          if (!sellForm.formState.isSubmitting) setSellOpen(o)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Sell — {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Available stock</span>
              <span className="tabular-nums font-medium">{selected?.stock}</span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sell-qty">Quantity</Label>
              <Input
                id="sell-qty"
                type="number"
                min="1"
                max={selected?.stock}
                autoFocus
                {...sellForm.register("quantity")}
              />
              {sellForm.formState.errors.quantity && (
                <p className="text-xs text-destructive">
                  {sellForm.formState.errors.quantity.message}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="tabular-nums font-semibold">
                RM {totalPreview.toFixed(2)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={sellForm.formState.isSubmitting}
              onClick={() => setSellOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={sellForm.formState.isSubmitting}
              onClick={sellForm.handleSubmit(onSellSubmit)}
            >
              {sellForm.formState.isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" /> Processing…</>
              ) : (
                "Confirm Sale"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
