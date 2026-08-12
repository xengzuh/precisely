import type { Uom } from "@/types/database"

export class UomError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UomError"
  }
}

const QTY_DP = 4

export function roundQty(value: number): number {
  return Math.round(value * 10 ** QTY_DP) / 10 ** QTY_DP
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Convert between units of measure.
 *
 * Mass and volume are interconvertible only when the product carries a
 * density. This matters constantly in chemical distribution: stock is held in
 * litres, priced by the kilogram, and ordered by the drum. Guessing here
 * produces a shipment of the wrong size, so an unknown density is an error
 * rather than an assumed 1.0.
 */
export function convert(
  qty: number,
  from: Uom,
  to: Uom,
  densityKgPerL?: number | null
): number {
  if (from === to) return roundQty(qty)

  if (from === "ea" || to === "ea") {
    throw new UomError(
      `Cannot convert between ${from} and ${to} — countable units have no mass or volume equivalence`
    )
  }

  if (!densityKgPerL || densityKgPerL <= 0) {
    throw new UomError(
      `Cannot convert ${from} to ${to} without a density. Set density_kg_per_l on the product.`
    )
  }

  // kg = L x (kg/L);  L = kg / (kg/L)
  return roundQty(from === "L" ? qty * densityKgPerL : qty / densityKgPerL)
}

export interface PackageLike {
  qty_per_package: number
  uom: Uom
}

/** "3 drums" -> quantity in the product's base unit. */
export function packagesToBase(
  packageCount: number,
  pkg: PackageLike,
  baseUom: Uom,
  densityKgPerL?: number | null
): number {
  const inPackageUom = packageCount * pkg.qty_per_package
  return convert(inPackageUom, pkg.uom, baseUom, densityKgPerL)
}

/** Inverse of the above — how many drums a base quantity comes to. */
export function baseToPackages(
  qtyInBase: number,
  pkg: PackageLike,
  baseUom: Uom,
  densityKgPerL?: number | null
): number {
  const inPackageUom = convert(qtyInBase, baseUom, pkg.uom, densityKgPerL)
  return roundQty(inPackageUom / pkg.qty_per_package)
}

/**
 * Resolve a quantity expressed in any of the ways an order might state it into
 * the product's base unit. This is the single funnel every inbound quantity
 * passes through, whether typed by a person or extracted by an agent.
 */
export function resolveToBase(
  input: { qty: number; uom?: Uom | null; packageCount?: number | null },
  product: { base_uom: Uom; density_kg_per_l?: number | null },
  pkg?: PackageLike | null
): number {
  if (input.packageCount != null && pkg) {
    return packagesToBase(input.packageCount, pkg, product.base_uom, product.density_kg_per_l)
  }
  if (input.uom && input.uom !== product.base_uom) {
    return convert(input.qty, input.uom, product.base_uom, product.density_kg_per_l)
  }
  return roundQty(input.qty)
}

const UOM_LABEL: Record<Uom, string> = { kg: "kg", L: "L", ea: "" }

export function formatQty(qty: number, uom: Uom): string {
  const n = roundQty(qty)
  // Trim trailing zeros: 25.0000 reads as noise on a packing list.
  const text = Number.isInteger(n) ? n.toString() : n.toString().replace(/0+$/, "")
  const label = UOM_LABEL[uom]
  return label ? `${text} ${label}` : text
}
