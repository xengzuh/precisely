"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BarcodeScanner } from "./BarcodeScanner"

type Props = {
  open: boolean
  onClose: () => void
  onScan: (sku: string) => void
}

export function ScannerModal({ open, onClose, onScan }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Scan Product Barcode</DialogTitle>
          <DialogDescription>
            Point your camera at a product barcode
          </DialogDescription>
        </DialogHeader>
        {/* Only mount BarcodeScanner while open to avoid camera running in background */}
        {open && <BarcodeScanner onScan={onScan} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
