"use client"

import { Loader2, Package, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { savePackageType } from "@/app/(dashboard)/inventory/[id]/actions"
import { Badge } from "@/components/ui/badge"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatQty } from "@/lib/erp/uom"
import type { PackageTypeRow, ProductDetail } from "@/lib/types"

/**
 * How a product physically ships.
 *
 * Customers order in drums and IBCs; stock is held in base units. Every
 * package type here is one more phrasing the PO intake agent can resolve
 * without guessing — "10 drums" only becomes a quantity if a drum is defined.
 */
export function PackagingEditor({ product }: { product: ProductDetail }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PackageTypeRow | null>(null)

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(pkg: PackageTypeRow) {
    setEditing(pkg)
    setOpen(true)
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Packaging</h2>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="size-4" />
          Add package
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border">
        {product.packageTypes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Package className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No package types. Orders can only be taken in {product.base_uom}.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead className="text-right">Holds</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Tare</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.packageTypes.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">
                    {pkg.name}
                    {pkg.is_default && (
                      <Badge variant="secondary" className="ml-2">
                        default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(pkg.qty_per_package, pkg.uom)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {pkg.tare_kg !== null ? `${pkg.tare_kg} kg` : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <PackageDialog
        key={editing?.id ?? "new"}
        product={product}
        pkg={editing}
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  )
}

function PackageDialog({
  product,
  pkg,
  open,
  onOpenChange,
}: {
  product: ProductDetail
  pkg: PackageTypeRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [name, setName] = useState(pkg?.name ?? "")
  const [qty, setQty] = useState(pkg ? String(pkg.qty_per_package) : "")
  const [tare, setTare] = useState(pkg?.tare_kg != null ? String(pkg.tare_kg) : "")
  const [isDefault, setIsDefault] = useState(pkg?.is_default ?? false)
  const [saving, setSaving] = useState(false)

  async function save() {
    const qtyNum = Number(qty)
    if (!name.trim()) return toast.error("Give the package a name")
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return toast.error("Quantity must be positive")

    setSaving(true)
    try {
      await savePackageType({
        packageTypeId: pkg?.id ?? null,
        productId: product.id,
        name: name.trim(),
        qtyPerPackage: qtyNum,
        uom: product.base_uom,
        tareKg: tare === "" ? null : Number(tare),
        isDefault,
      })
      onOpenChange(false)
      toast.success(pkg ? "Package updated" : "Package added")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save package")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{pkg ? "Edit package" : "Add package"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pk-name">Name</Label>
            <Input
              id="pk-name"
              placeholder={`e.g. 200 ${product.base_uom} drum`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pk-qty">Holds ({product.base_uom})</Label>
              <Input
                id="pk-qty"
                type="number"
                min="0"
                step="0.0001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pk-tare">Tare weight (kg)</Label>
              <Input
                id="pk-tare"
                type="number"
                min="0"
                step="0.001"
                placeholder="Optional"
                value={tare}
                onChange={(e) => setTare(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input accent-primary"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Default package for this product
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
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
    </Dialog>
  )
}
