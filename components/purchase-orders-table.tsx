"use client"

import { useEffect, useState } from "react"
import { Plus, ClipboardList, Loader2 } from "lucide-react"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { addPurchaseOrder, markReceived } from "@/app/(dashboard)/purchase-orders/actions"
import type { ProductListItem, PurchaseOrderListItem, Supplier } from "@/lib/types"

// ── Schema ───────────────────────────────────────────────────────────────────

const poSchema = z.object({
  supplierId: z.string().min(1, "Please select a supplier"),
  productId:  z.string().min(1, "Please select a product"),
  // Decimal, not integer — chemicals are bought in fractional kg and L.
  quantity:   z.coerce.number().positive("Must be greater than 0"),
  unitCost:   z.coerce.number().min(0.0001, "Must be greater than 0"),
  lotCode:    z.string().optional(),
})
type PoValues = z.infer<typeof poSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const [y, m, day] = d.slice(0, 10).split("-")
  return `${day} ${months[parseInt(m, 10) - 1]} ${y}`
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
      status === "received"  && "bg-green-100 text-green-800",
      status === "ordered"   && "bg-amber-100 text-amber-800",
      status === "partial"   && "bg-blue-100 text-blue-800",
      status === "draft"     && "bg-slate-100 text-slate-700",
      status === "cancelled" && "bg-gray-100 text-gray-600",
    )}>
      {status}
    </span>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

type Props = {
  orders: PurchaseOrderListItem[]
  suppliers: Supplier[]
  products: ProductListItem[]
  defaultProductId: string | null
}

export function PurchaseOrdersTable({ orders, suppliers, products, defaultProductId }: Props) {
  // ── New PO dialog ────────────────────────────────────────────────────────
  const [newPoOpen, setNewPoOpen] = useState(false)

  const poForm = useForm<PoValues>({
    resolver: zodResolver(poSchema) as Resolver<PoValues>,
    defaultValues: {
      supplierId: "",
      productId:  defaultProductId ?? "",
    },
  })

  const watchedQty  = poForm.watch("quantity")
  const watchedCost = poForm.watch("unitCost")
  const watchedProductId = poForm.watch("productId")
  const totalPreview = (Number(watchedQty) || 0) * (Number(watchedCost) || 0)

  const selectedProduct = products.find((p) => p.id === watchedProductId) ?? null

  // Auto-open with pre-selected product when coming from Dashboard Reorder link
  useEffect(() => {
    if (defaultProductId) {
      poForm.setValue("productId", defaultProductId)
      setNewPoOpen(true)
    }
  }, [defaultProductId, poForm])

  async function onPoSubmit(values: PoValues) {
    try {
      await addPurchaseOrder({
        supplierId: values.supplierId,
        productId:  values.productId,
        quantity:   values.quantity,
        unitCost:   values.unitCost,
        uom:        selectedProduct?.base_uom ?? "ea",
        lotCode:    values.lotCode?.trim() || null,
      })
      setNewPoOpen(false)
      poForm.reset()
      toast.success("Purchase order created successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create order")
    }
  }

  // ── Mark Received dialog ─────────────────────────────────────────────────
  const [markOpen, setMarkOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderListItem | null>(null)
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState<string | null>(null)

  async function handleMarkReceived() {
    if (!selectedOrder) return
    setMarking(true)
    setMarkError(null)
    try {
      await markReceived(selectedOrder.id)
      setMarkOpen(false)
      setSelectedOrder(null)
      toast.success("Order marked as received")
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Failed to mark as received")
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Purchase Orders</h1>
        <Button size="sm" onClick={() => setNewPoOpen(true)}>
          <Plus className="size-4" />
          New Order
        </Button>
      </div>

      {/* ── Orders table / empty state ── */}
      <div className="rounded-xl border overflow-hidden">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center px-4">
            <ClipboardList className="size-10 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No purchase orders yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first order to restock inventory.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setNewPoOpen(true)}>
              <Plus className="size-4" />
              New Order
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs font-medium">{o.order_no}</TableCell>
                  <TableCell>{o.supplierName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.lineCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    RM {Number(o.total).toFixed(2)}
                  </TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmtDate(o.order_date)}
                  </TableCell>
                  <TableCell>
                    {(o.status === "ordered" || o.status === "partial" || o.status === "draft") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSelectedOrder(o); setMarkOpen(true) }}
                      >
                        Mark Received
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── New Purchase Order dialog ── */}
      <Dialog
        open={newPoOpen}
        onOpenChange={(o) => {
          if (!poForm.formState.isSubmitting) {
            setNewPoOpen(o)
            if (!o) poForm.reset()
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {/* Supplier select */}
            <div className="grid gap-1.5">
              <Label>Supplier</Label>
              <Controller
                control={poForm.control}
                name="supplierId"
                render={({ field }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {poForm.formState.errors.supplierId && (
                <p className="text-xs text-destructive">
                  {poForm.formState.errors.supplierId.message}
                </p>
              )}
            </div>

            {/* Product select */}
            <div className="grid gap-1.5">
              <Label>Product</Label>
              <Controller
                control={poForm.control}
                name="productId"
                render={({ field }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {poForm.formState.errors.productId && (
                <p className="text-xs text-destructive">
                  {poForm.formState.errors.productId.message}
                </p>
              )}
            </div>

            {/* Quantity + Unit Cost */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="po-qty">
                  Quantity{selectedProduct ? ` (${selectedProduct.base_uom})` : ""}
                </Label>
                <Input
                  id="po-qty"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="0"
                  {...poForm.register("quantity")}
                />
                {poForm.formState.errors.quantity && (
                  <p className="text-xs text-destructive">
                    {poForm.formState.errors.quantity.message}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-cost">
                  Unit Cost{selectedProduct ? ` (RM / ${selectedProduct.base_uom})` : " (RM)"}
                </Label>
                <Input
                  id="po-cost"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="0.00"
                  {...poForm.register("unitCost")}
                />
                {poForm.formState.errors.unitCost && (
                  <p className="text-xs text-destructive">
                    {poForm.formState.errors.unitCost.message}
                  </p>
                )}
              </div>
            </div>

            {/*
              Recording the supplier's lot code at order time means the batch is
              created with the right identity when the goods are booked in,
              rather than getting an auto-generated placeholder.
            */}
            {selectedProduct?.is_batch_tracked && (
              <div className="grid gap-1.5">
                <Label htmlFor="po-lot">Lot code</Label>
                <Input
                  id="po-lot"
                  placeholder="Optional — supplier's lot reference"
                  {...poForm.register("lotCode")}
                />
              </div>
            )}

            {/* Live total preview */}
            {totalPreview > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Cost</span>
                <span className="font-semibold tabular-nums">
                  RM {totalPreview.toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={poForm.formState.isSubmitting}
              onClick={() => { setNewPoOpen(false); poForm.reset() }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={poForm.formState.isSubmitting}
              onClick={poForm.handleSubmit(onPoSubmit)}
            >
              {poForm.formState.isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" /> Creating…</>
              ) : (
                "Create Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mark Received confirmation dialog ── */}
      <Dialog
        open={markOpen}
        onOpenChange={(o) => { if (!marking) { setMarkOpen(o); if (!o) setMarkError(null) } }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Mark as Received</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Order</span>
              <span className="font-mono text-xs font-medium">{selectedOrder?.order_no}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Supplier</span>
              <span className="font-medium">{selectedOrder?.supplierName ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Lines</span>
              <span className="font-medium tabular-nums">{selectedOrder?.lineCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Cost</span>
              <span className="font-semibold tabular-nums">
                RM {Number(selectedOrder?.total ?? 0).toFixed(2)}
              </span>
            </div>
            <p className="border-t pt-1 text-xs text-muted-foreground">
              Every line will be booked into stock, batches created from their lot codes,
              and each product&apos;s cost price updated to what was paid.
            </p>
            {markError && <p className="text-sm text-destructive">{markError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={marking}
              onClick={() => { setMarkOpen(false); setMarkError(null) }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={marking} onClick={handleMarkReceived}>
              {marking ? (
                <><Loader2 className="size-4 animate-spin" /> Processing…</>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
