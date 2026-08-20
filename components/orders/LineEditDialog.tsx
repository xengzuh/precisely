"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { updateOrderLine } from "@/app/(dashboard)/orders/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatQty } from "@/lib/erp/uom"
import type { ProductListItem, SalesOrderLineDetail } from "@/lib/types"

/**
 * Resolve one order line.
 *
 * This is the human half of PO intake: the extractor records what the document
 * said in `description_raw` and leaves `product_id` null when it cannot match
 * with confidence, and someone who knows the catalog picks the right chemical.
 * Quantity is always in the product's base unit — the conversion from drums or
 * kg happened upstream.
 */
export function LineEditDialog({
  line,
  products,
  open,
  onOpenChange,
}: {
  line: SalesOrderLineDetail | null
  products: ProductListItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [saving, setSaving] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      {/* Keyed on the line so picking a different one remounts the form with
          fresh initial values. Copying props into state with an effect instead
          would re-render the dialog twice every time it opens. */}
      {line && (
        <LineEditForm
          key={line.id}
          line={line}
          products={products}
          saving={saving}
          onSavingChange={setSaving}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}

function LineEditForm({
  line,
  products,
  saving,
  onSavingChange,
  onClose,
}: {
  line: SalesOrderLineDetail
  products: ProductListItem[]
  saving: boolean
  onSavingChange: (saving: boolean) => void
  onClose: () => void
}) {
  const router = useRouter()
  const [productId, setProductId] = useState(line.productId ?? "")
  const [qty, setQty] = useState(String(line.qty))
  const [unitPrice, setUnitPrice] = useState(String(line.unit_price))

  const selected = products.find((p) => p.id === productId) ?? null

  async function save() {
    const qtyNum = Number(qty)
    const priceNum = Number(unitPrice)

    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Quantity must be greater than zero")
      return
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Unit price cannot be negative")
      return
    }

    onSavingChange(true)
    try {
      await updateOrderLine({
        lineId: line.id,
        productId: productId || null,
        qty: qtyNum,
        unitPrice: priceNum,
      })
      onClose()
      toast.success("Line updated")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update line")
    } finally {
      onSavingChange(false)
    }
  }

  return (
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>Edit line {line.line_no}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-3">
        {line.description_raw && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              As written on the order
            </p>
            <p className="mt-1 text-sm">{line.description_raw}</p>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="le-product">Product</Label>
          <Select
            value={productId}
            onValueChange={(v) => setProductId(v ?? "")}
          >
            <SelectTrigger id="le-product" className="w-full">
              <SelectValue placeholder="Select a product…" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && (
            <p className="text-xs text-muted-foreground">
              {formatQty(selected.available, selected.base_uom)} available
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="le-qty">
              Quantity{selected ? ` (${selected.base_uom})` : ""}
            </Label>
            <Input
              id="le-qty"
              type="number"
              min="0"
              step="0.0001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="le-price">Unit price</Label>
            <Input
              id="le-price"
              type="number"
              min="0"
              step="0.0001"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={save}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
