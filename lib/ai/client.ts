import Anthropic from "@anthropic-ai/sdk"

/**
 * The single place the Anthropic client is constructed.
 *
 * Everything model-related lives here so there is one file to change when the
 * model or its defaults move, and so no call site can quietly pick a different
 * model or forget the refusal handling below.
 */

/**
 * The model, overridable for testing.
 *
 * Opus 5 is the production default. Set ANTHROPIC_MODEL to try a cheaper tier
 * — `claude-sonnet-5` or `claude-haiku-4-5` — while shaking out the pipeline.
 * Everything below adapts to the choice, because the tiers differ in ways that
 * are 400 errors rather than quality differences.
 */
export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5"

/**
 * Effort by task shape.
 *
 * Extraction is one structured call over a document — high is enough. Agent
 * loops plan across many tool calls and are where the extra reasoning pays
 * for itself, so they run at xhigh.
 */
export const EFFORT = {
  extraction: "high",
  agent: "xhigh",
} as const

/**
 * Haiku 4.5 predates the effort parameter and rejects it outright with a 400 —
 * this is not a quality difference to shrug at, it is a hard failure. Build the
 * output_config through `outputConfig()` rather than making call sites
 * remember which tier they are on.
 */
const NO_EFFORT_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-5"]

export function supportsEffort(model: string = MODEL): boolean {
  return !NO_EFFORT_MODELS.some((m) => model.startsWith(m))
}

export function outputConfig<TFormat>(
  effort: (typeof EFFORT)[keyof typeof EFFORT],
  format?: TFormat
) {
  return {
    ...(supportsEffort() ? { effort } : {}),
    ...(format ? { format } : {}),
  }
}

/** Non-streaming ceiling. Anything larger must stream or it risks an HTTP timeout. */
export const MAX_TOKENS = 16_000

let cached: Anthropic | null = null

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local — server-side only, never with a NEXT_PUBLIC_ prefix."
    )
    this.name = "MissingApiKeyError"
  }
}

export function getAnthropic(): Anthropic {
  if (typeof window !== "undefined") {
    throw new Error("The Anthropic client is server-only — it would leak the API key to the browser")
  }
  if (cached) return cached

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new MissingApiKeyError()

  cached = new Anthropic({ apiKey })
  return cached
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Opus 5's safety classifiers can decline a request outright. That arrives as
 * a normal HTTP 200 with stop_reason "refusal" and an empty or partial content
 * array — so reading content[0] without checking this first throws on exactly
 * the case you most want a clear error for.
 */
export class RefusalError extends Error {
  constructor(readonly category: string | null) {
    super(
      `The model declined this request${category ? ` (${category})` : ""}. ` +
        "This can happen on documents it reads as sensitive; a human can process it manually."
    )
    this.name = "RefusalError"
  }
}

type StopDetails = { category?: string | null } | null | undefined

export function assertNotRefused(response: {
  stop_reason: string | null
  stop_details?: StopDetails
}): void {
  if (response.stop_reason === "refusal") {
    throw new RefusalError(response.stop_details?.category ?? null)
  }
}

/** What an agent run cost, for the agent_runs ledger. */
export type Usage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

/**
 * List price per million tokens. Cache reads cost a tenth of a fresh read and
 * writes a quarter more, so folding them in at the base rate would badly
 * misstate the PO intake agent, whose catalog prefix is meant to be cached.
 *
 * Prices must track the model — a run recorded at Opus rates while actually
 * served by Haiku makes the whole agent_runs ledger fiction.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  // Sonnet 5 carries introductory pricing ($2/$10) until 2026-08-31; the
  // standard rate is used here so the ledger errs high rather than low.
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
}

const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_MULTIPLIER = 1.25

function ratesFor(model: string) {
  const key = Object.keys(PRICING).find((m) => model.startsWith(m))
  // An unknown model is priced as Opus so a surprise reads as expensive
  // rather than free.
  return PRICING[key ?? "claude-opus-5"]
}

export function priceUsage(
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number | null
    cache_creation_input_tokens?: number | null
  },
  model: string = MODEL
): Usage {
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const rate = ratesFor(model)

  const costUsd =
    (usage.input_tokens * rate.in +
      usage.output_tokens * rate.out +
      cacheRead * rate.in * CACHE_READ_MULTIPLIER +
      cacheWrite * rate.in * CACHE_WRITE_MULTIPLIER) /
    1_000_000

  return {
    // input_tokens excludes cached tokens; report the true prompt size.
    inputTokens: usage.input_tokens + cacheRead + cacheWrite,
    outputTokens: usage.output_tokens,
    // Split out so a cache that never hits is visible in the ledger rather
    // than hiding inside the input total.
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
  }
}
