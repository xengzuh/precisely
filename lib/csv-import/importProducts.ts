import type { Uom } from "@/types/database"

/**
 * One row as the column mapper hands it over: strings and numbers straight
 * from the spreadsheet, nothing validated yet.
 */
export type MappedRow = {
  name?: string
  sku?: string
  baseUom?: string
  densityKgPerL?: number | string
  costPrice?: number | string
  listPrice?: number | string
  openingQty?: number | string
  reorderPoint?: number | string
  grade?: string
  concentrationPct?: number | string
  lotCode?: string
}

export type NormalizedRow = {
  name: string
  sku: string
  baseUom: Uom
  densityKgPerL: number | null
  costPrice: number
  listPrice: number
  openingQty: number
  reorderPoint: number | null
  grade: string | null
  concentrationPct: number | null
  lotCode: string | null
}

export type ImportResult = {
  imported: number
  skipped: number
  errors: string[]
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  // Spreadsheets export "1,234.50" and "RM 6.40" — strip anything non-numeric
  // rather than letting Number() turn the whole cell into NaN.
  const cleaned = String(value).replace(/[^0-9.\-]/g, "")
  if (cleaned === "" || cleaned === "-") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function toUom(value: unknown): Uom | null {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "") return null
  if (["kg", "kgs", "kilogram", "kilograms"].includes(raw)) return "kg"
  if (["l", "ltr", "litre", "litres", "liter", "liters"].includes(raw)) return "L"
  if (["ea", "each", "unit", "units", "pc", "pcs", "piece", "pieces"].includes(raw)) return "ea"
  return null
}

/**
 * Validate and coerce spreadsheet rows. Pure — no database, no side effects —
 * so the coercion rules can be unit tested without a Supabase project.
 */
export function normalizeRows(rows: MappedRow[]): {
  valid: NormalizedRow[]
  errors: string[]
} {
  const valid: NormalizedRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  rows.forEach((row, index) => {
    const label = `Row ${index + 2}` // +2: row 1 is the header

    const name = (row.name ?? "").trim()
    const sku = (row.sku ?? "").trim()

    if (!name && !sku) return // silently skip blank rows
    if (!name || !sku) {
      errors.push(`${label}: name and SKU are both required`)
      return
    }

    if (seen.has(sku.toLowerCase())) {
      errors.push(`${label}: SKU "${sku}" appears more than once in this file`)
      return
    }
    seen.add(sku.toLowerCase())

    const baseUom = toUom(row.baseUom) ?? "ea"
    const density = toNumber(row.densityKgPerL)

    if (baseUom !== "ea" && density !== null && density <= 0) {
      errors.push(`${label}: density must be greater than zero`)
      return
    }

    const concentration = toNumber(row.concentrationPct)
    if (concentration !== null && (concentration < 0 || concentration > 100)) {
      errors.push(`${label}: concentration must be between 0 and 100`)
      return
    }

    const openingQty = toNumber(row.openingQty) ?? 0
    if (openingQty < 0) {
      errors.push(`${label}: opening quantity cannot be negative`)
      return
    }

    valid.push({
      name,
      sku,
      baseUom,
      densityKgPerL: density,
      costPrice: Math.max(toNumber(row.costPrice) ?? 0, 0),
      listPrice: Math.max(toNumber(row.listPrice) ?? 0, 0),
      openingQty,
      reorderPoint: toNumber(row.reorderPoint),
      grade: (row.grade ?? "").trim() || null,
      concentrationPct: concentration,
      lotCode: (row.lotCode ?? "").trim() || null,
    })
  })

  return { valid, errors }
}
