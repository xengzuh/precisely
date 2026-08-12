import { z } from "zod"

/**
 * Shared Zod primitives.
 *
 * `isoDate` is spelled as an explicit regex rather than `z.string().date()` or
 * `z.iso.date()` because those moved between Zod 3 and 4 — this form behaves
 * identically on both and matches what Postgres `date` columns accept.
 */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD")

export const uomSchema = z.enum(["kg", "L", "ea"])

export const money = z.number().min(0).finite()
export const quantity = z.number().positive().finite()
