"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { MappedRow } from "@/lib/csv-import/importProducts"

type RequiredField = "name" | "sku" | "stock" | "price"
type Mapping = Record<RequiredField, string>

const REQUIRED_FIELDS: { field: RequiredField; label: string; example: string }[] = [
  { field: "name",  label: "Product Name", example: "e.g. Wireless Keyboard" },
  { field: "sku",   label: "SKU / Code",   example: "e.g. WK-001" },
  { field: "stock", label: "Stock (Qty)",  example: "e.g. 50" },
  { field: "price", label: "Price (RM)",   example: "e.g. 79.90" },
]

const FIELD_KEYWORDS: Record<RequiredField, string[]> = {
  name:  ["name", "product", "title", "item", "description"],
  sku:   ["sku", "code", "barcode", "ref", "part"],
  stock: ["stock", "quantity", "qty", "inventory", "units", "count", "available"],
  price: ["price", "cost", "rate", "value", "amount"],
}

function autoDetect(headers: string[]): Partial<Mapping> {
  const mapping: Partial<Mapping> = {}
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS) as [RequiredField, string[]][]) {
    const match = headers.find((h) =>
      keywords.some((k) => h.toLowerCase().includes(k))
    )
    if (match) mapping[field] = match
  }
  return mapping
}

function applyMapping(
  headers: string[],
  rows: Record<string, string>[],
  mapping: Mapping
): MappedRow[] {
  return rows.map((row) => ({
    name:  row[mapping.name]?.trim()  ?? "",
    sku:   row[mapping.sku]?.trim()   ?? "",
    stock: Math.max(0, parseInt(row[mapping.stock] ?? "0", 10) || 0),
    price: Math.max(0, parseFloat(row[mapping.price] ?? "0") || 0),
  }))
}

type Props = {
  headers: string[]
  rows: Record<string, string>[]
  onImport: (mappedRows: MappedRow[]) => void
  onBack: () => void
  isImporting: boolean
}

export function ColumnMapper({ headers, rows, onImport, onBack, isImporting }: Props) {
  const [mapping, setMapping] = useState<Partial<Mapping>>(autoDetect(headers))
  const [showPreview, setShowPreview] = useState(false)

  const allMapped = REQUIRED_FIELDS.every((f) => mapping[f.field])
  const fullMapping = mapping as Mapping

  const previewRows = allMapped
    ? applyMapping(headers, rows, fullMapping).slice(0, 5)
    : []

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Match your CSV columns to the required fields.
        </p>

        {REQUIRED_FIELDS.map(({ field, label, example }) => {
          const isMapped = Boolean(mapping[field])
          return (
            <div key={field} className="grid gap-1.5">
              <Label className={cn(!isMapped && "text-amber-600")}>
                {label}
                {!isMapped && (
                  <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide">
                    Required
                  </span>
                )}
              </Label>
              <Select
                value={mapping[field] ?? ""}
                onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v || undefined }))}
              >
                <SelectTrigger
                  className={cn(
                    "w-full",
                    !isMapped && "border-amber-400 focus:ring-amber-400"
                  )}
                >
                  <SelectValue placeholder={`Select column — ${example}`} />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>

      {!allMapped && (
        <p className="text-xs text-amber-600 font-medium">
          Please map all required fields before importing.
        </p>
      )}

      {/* Preview toggle */}
      {allMapped && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-primary"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            {showPreview ? "Hide" : "Preview"} import data
          </button>

          {showPreview && (
            <div className="rounded-lg border overflow-x-auto text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {REQUIRED_FIELDS.map(({ field, label }) => (
                      <th key={field} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap max-w-32 truncate">{row.name}</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{row.sku}</td>
                      <td className="px-3 py-2 tabular-nums">{row.stock}</td>
                      <td className="px-3 py-2 tabular-nums">RM {row.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={onBack}
          disabled={isImporting}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!allMapped || isImporting}
          onClick={() => onImport(applyMapping(headers, rows, fullMapping))}
        >
          {isImporting ? "Importing…" : `Import ${rows.length} Products`}
        </Button>
      </div>
    </div>
  )
}
