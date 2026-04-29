"use client"

import { useState } from "react"
import { Plus, Users, Loader2 } from "lucide-react"
import { useForm, type Resolver } from "react-hook-form"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addSupplier } from "@/app/(dashboard)/suppliers/actions"
import type { Supplier } from "@/lib/types"

// ── Schema ───────────────────────────────────────────────────────────────────

const addSupplierSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().refine(
    (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Must be a valid email address"
  ),
  phone: z.string().refine(
    (v) => v === "" || v.replace(/\s/g, "").length >= 7,
    "Must be at least 7 characters"
  ),
})
type AddSupplierValues = z.infer<typeof addSupplierSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const [y, m, day] = d.slice(0, 10).split("-")
  return `${day} ${months[parseInt(m, 10) - 1]} ${y}`
}

// ── Component ────────────────────────────────────────────────────────────────

export function SuppliersTable({ suppliers }: { suppliers: Supplier[] }) {
  const [open, setOpen] = useState(false)

  const form = useForm<AddSupplierValues>({
    resolver: zodResolver(addSupplierSchema) as Resolver<AddSupplierValues>,
    defaultValues: { name: "", email: "", phone: "" },
  })

  async function onSubmit(values: AddSupplierValues) {
    const fd = new FormData()
    fd.set("name", values.name)
    fd.set("email", values.email)
    fd.set("phone", values.phone)
    try {
      await addSupplier(fd)
      setOpen(false)
      form.reset()
      toast.success("Supplier added successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add supplier")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Suppliers</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Add Supplier
        </Button>
      </div>

      {/* ── Suppliers table / empty state ── */}
      <div className="rounded-xl border overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center px-4">
            <Users className="size-10 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No suppliers yet</p>
              <p className="text-xs text-muted-foreground">
                Add your first supplier to start creating purchase orders.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              Add Supplier
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Date Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmtDate(s.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Add Supplier dialog ── */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!form.formState.isSubmitting) {
            setOpen(o)
            if (!o) form.reset()
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sup-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sup-name"
                placeholder="e.g. TechZone Supply Co."
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sup-email">Email</Label>
              <Input
                id="sup-email"
                type="email"
                placeholder="orders@supplier.com"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input
                id="sup-phone"
                placeholder="+60 3-1234 5678"
                {...form.register("phone")}
              />
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={form.formState.isSubmitting}
              onClick={() => { setOpen(false); form.reset() }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={form.formState.isSubmitting}
              onClick={form.handleSubmit(onSubmit)}
            >
              {form.formState.isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" /> Saving…</>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
