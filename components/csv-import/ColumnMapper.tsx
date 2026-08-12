"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MappedRow } from "@/lib/csv-import/importProducts"
import { cn } from "@/lib/utils"

type Field = keyof MappedRow
type Mapping = Partial<Record<Field, string>>

type FieldSpec = {
  field: Field
  label: string
  example: string
  required?: boolean
  keywords: string[]
}

/**
 * Only name and SKU are required. Everything else is optional so a customer can
 * import a bare product list on day one and enrich it later — but the chemical
 * fields are offered here because retro-fitting density and units across a
 * whole catalogue by hand is the thing that stalls an onboarding.
 */
const FIELDS: FieldSpec[] = [
  {
    field: "name",
    label: "Product name",
    example: "e.g. Isopropyl Alcohol 99%",
    required: true,
    keywords: ["name", "product", "title", "item", "description", "material"],
  },
  {
    field: "sku",
    label: "SKU / code",
    example: "e.g. SOL-IPA-99",
    required: true,
    keywords: ["sku", "code", "barcode", "ref", "part", "article"],
  },
  {
    field: "baseUom",
    label: "Base unit (kg / L / ea)",
    example: "e.g. L",
    keywords: ["uom", "unit", "measure", "basis"],
  },
  {
    field: "densityKgPerL",
    label: "Density (kg/L)",
    example: "e.g. 0.786",
    keywords: ["density", "sg", "specific gravity", "relative density"],
  },
  {
    field: "openingQty",
    label: "Opening stock",
    example: "e.g. 1200",
    keywords: ["stock", "quantity", "qty", "inventory", "on hand", "onhand", "available"],
  },
  {
    field: "costPrice",
    label: "Cost price",
    example: "e.g. 6.40",
    keywords: ["cost", "buy", "purchase price", "landed"],
  },
  {
    field: "listPrice",
    label: "List price",
    example: "e.g. 9.50",
    keywords: ["list", "sell", "selling", "price", "rate", "unit price"],
  },
  {
    field: "reorderPoint",
    label: "Reorder point",
    example: "e.g. 400",
    keywords: ["reorder", "min", "minimum", "safety"],
  },
  {
    field: "grade",
    label: "Grade",
    example: "e.g. Technical",
    keywords: ["grade", "quality", "spec"],
  },
  {
    field: "concentrationPct",
    label: "Concentration (%)",
    example: "e.g. 99",
    keywords: ["concentration", "conc", "purity", "assay", "strength"],
  },
  {
    field: "lotCode",
    label: "Lot code",
    example: "e.g. IPA-2601-A",
    keywords: ["lot", "batch"],
  },
]

const REQUIRED = FIELDS.filter((f) => f.required)
const OPTIONAL = FIELDS.filter((f) => !f.required)

function autoDetect(headers: string[]): Mapping {
  const mapping: Mapping = {}
  const taken = new Set<string>()

  // Longest keyword first so "unit price" beats a bare "unit" for list price.
  for (const { field, keywords } of FIELDS) {
    const sorted = [...keywords].sort((a, b) => b.length - a.length)
    const match = headers.find(
      (h) => !taken.has(h) && sorted.some((k) => h.toLowerCase().includes(k))
    )
    if (match) {
      mapping[field] = match
      taken.add(match)
    }
  }
  return mapping
}

function applyMapping(rows: Record<string, string>[], mapping: Mapping): MappedRow[] {
  return rows.map((row) => {
    const out: MappedRow = {}
    for (const { field } of FIELDS) {
      const column = mapping[field]
      if (!column) continue
      const value = row[column]?.trim()
      if (value) out[field] = value
    }
    return out
  })
}

type Props = {
  headers: string[]
  rows: Record<string, string>[]
  onImport: (mappedRows: MappedRow[]) => void
  onBack: () => void
  isImporting: boolean
}

function FieldRow({
  spec,
  headers,
  value,
  onChange,
}: {
  spec: FieldSpec
  headers: string[]
  value: string | undefined
  onChange: (v: string | undefined) => void
}) {
  const missing = spec.required && !value
  return (
    <div className="grid gap-1.5">
      <Label className={cn(missing && "text-amber-600")}>
        {spec.label}
        {missing && (
          <span className="ml-1.5 text-[10px] font-normal tracking-wide uppercase">
            Required
          </span>
        )}
      </Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
        <SelectTrigger
          className={cn("w-full", missing && "border-amber-400 focus:ring-amber-400")}
        >
          <SelectValue placeholder={`Select column — ${spec.example}`} />
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
}

export function ColumnMapper({ headers, rows, onImport, onBack, isImporting }: Props) {
  const [mapping, setMapping] = useState<Mapping>(() => autoDetect(headers))
  const [showPreview, setShowPreview] = useState(false)
  const [showOptional, setShowOptional] = useState(true)

  const allMapped = REQUIRED.every((f) => mapping[f.field])
  const mappedFields = FIELDS.filter((f) => mapping[f.field])
  const previewRows = allMapped ? applyMapping(rows, mapping).slice(0, 5) : []

  function set(field: Field, value: string | undefined) {
    setMapping((m) => ({ ...m, [field]: value }))
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Match your spreadsheet columns to product fields. We have guessed where we can.
        </p>

        {REQUIRED.map((spec) => (
          <FieldRow
            key={spec.field}
            spec={spec}
            headers={headers}
            value={mapping[spec.field]}
            onChange={(v) => set(spec.field, v)}
          />
        ))}
      </div>

      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium text-primary"
          onClick={() => setShowOptional((v) => !v)}
        >
          {showOptional ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Optional fields
        </button>

        {showOptional &&
          OPTIONAL.map((spec) => (
            <FieldRow
              key={spec.field}
              spec={spec}
              headers={headers}
              value={mapping[spec.field]}
              onChange={(v) => set(spec.field, v)}
            />
          ))}
      </div>

      {!allMapped && (
        <p className="text-xs font-medium text-amber-600">
          Map the product name and SKU before importing.
        </p>
      )}

      {allMapped && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-primary"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {showPreview ? "Hide" : "Preview"} import data
          </button>

          {showPreview && (
            <div className="overflow-x-auto rounded-lg border text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {mappedFields.map(({ field, label }) => (
                      <th
                        key={field}
                        className="px-3 py-2 text-left font-medium whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {mappedFields.map(({ field }) => (
                        <td key={field} className="max-w-32 truncate px-3 py-2 whitespace-nowrap">
                          {row[field] ?? "—"}
                        </td>
                      ))}
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
          onClick={() => onImport(applyMapping(rows, mapping))}
        >
          {isImporting ? "Importing…" : `Import ${rows.length} Products`}
        </Button>
      </div>
    </div>
  )
}
