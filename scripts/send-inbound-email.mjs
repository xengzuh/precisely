#!/usr/bin/env node
/**
 * Post a signed message to the inbound-email webhook, without a mail provider.
 *
 * The webhook verifies an HMAC-SHA256 of the raw request body before it reads
 * anything, so it cannot be exercised with curl alone — the signature has to be
 * computed over the exact bytes that get sent. That is what this does.
 *
 *   node scripts/send-inbound-email.mjs
 *   node scripts/send-inbound-email.mjs --text "Please supply 3 x 250 L drums caustic soda 32%"
 *   node scripts/send-inbound-email.mjs --pdf ./fixtures/PO4471.pdf
 *   node scripts/send-inbound-email.mjs --message-id "<abc@acme.com>"   # replay, to test dedup
 *   node scripts/send-inbound-email.mjs --bad-signature                 # expect 401
 *
 * Requires the dev server running and INBOUND_WEBHOOK_SECRET + INBOUND_ORG_ID
 * set in .env.local.
 */

import { createHmac, randomUUID } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { basename } from "node:path"

const DEFAULT_URL = "http://localhost:3000/api/inbound/email"

// Deliberately carries a quoted reply below the real order: the previous
// message names a *different* product, so if quoted-history stripping ever
// regresses, the extracted order changes and this default surfaces it.
const DEFAULT_TEXT = `Hi,

Please supply against our PO 4471:

  2 x 200 L drums Isopropyl Alcohol 99%
  500 kg caustic soda flakes

Delivery to the Shah Alam plant by 30 August.

Thanks,
Ahmad

On Wed, 12 Aug 2026 at 09:14, Sales <sales@selangorchem.com> wrote:
> Following up on your enquiry for 1000 L of sulphuric acid 98%.
> Please confirm if you would like us to proceed.
`

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("--")) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith("--")) {
      args.values[key] = next
      i++
    } else {
      args.flags.add(key)
    }
  }
  return args
}

/**
 * Minimal .env.local reader. Deliberately not a dependency — this script runs
 * before anything else is set up, and it only needs one key.
 */
async function readEnvLocal() {
  let raw
  try {
    raw = await readFile(".env.local", "utf8")
  } catch {
    return {}
  }

  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
  }
  return env
}

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const env = await readEnvLocal()

const secret = process.env.INBOUND_WEBHOOK_SECRET || env.INBOUND_WEBHOOK_SECRET
if (!secret) {
  fail(
    "INBOUND_WEBHOOK_SECRET is not set.\n" +
      "  Add it to .env.local (any random string will do for local testing):\n\n" +
      "    INBOUND_WEBHOOK_SECRET=" +
      randomUUID()
  )
}
if (!(process.env.INBOUND_ORG_ID || env.INBOUND_ORG_ID)) {
  console.warn(
    "  Warning: INBOUND_ORG_ID is not set in .env.local — the webhook will answer 501.\n" +
      "  Set it to your organization's id:  select id from organizations;\n"
  )
}

const url = args.values.url ?? DEFAULT_URL
// A fresh id each run so repeated sends create separate documents. Pass
// --message-id with a previous value to prove the dedup path instead.
const messageId = args.values["message-id"] ?? `<${randomUUID()}@test.local>`

const payload = {
  from: args.values.from ?? "Ahmad Faizal <ahmad@acmecoatings.com>",
  subject: args.values.subject ?? "PO 4471 - Acme Coatings",
  messageId,
  text: args.values.text ?? DEFAULT_TEXT,
}

if (args.values.pdf) {
  const path = args.values.pdf
  let content
  let size
  try {
    const buffer = await readFile(path)
    content = buffer.toString("base64")
    size = (await stat(path)).size
  } catch (err) {
    fail(`Could not read ${path}: ${err.message}`)
  }

  if (size < 10_000) {
    console.warn(
      `  Warning: ${basename(path)} is ${size} bytes. The webhook skips PDFs under 10 KB\n` +
        "  as signature logos, so this attachment will be ignored.\n"
    )
  }

  payload.attachments = [
    { name: basename(path), contentType: "application/pdf", size, content },
  ]
}

// The signature must cover the exact bytes sent, so serialise once and use
// that same string for both the HMAC and the request body.
const body = JSON.stringify(payload)

let signature = createHmac("sha256", secret).update(body, "utf8").digest("hex")
if (args.flags.has("bad-signature")) {
  // Same length, different value — this exercises the comparison rather than
  // the length check that precedes it.
  signature = signature.replace(/^./, (c) => (c === "a" ? "b" : "a"))
}

const headers = { "content-type": "application/json" }
if (!args.flags.has("no-signature")) headers["x-webhook-signature"] = signature

console.log(`\n  POST ${url}`)
console.log(`  from        ${payload.from}`)
console.log(`  subject     ${payload.subject}`)
console.log(`  message-id  ${messageId}`)
console.log(`  body        ${body.length.toLocaleString()} bytes`)
if (payload.attachments) console.log(`  attachment  ${payload.attachments[0].name}`)
if (args.flags.has("bad-signature")) console.log("  signature   DELIBERATELY WRONG (expect 401)")
if (args.flags.has("no-signature")) console.log("  signature   OMITTED (expect 401)")

let response
try {
  response = await fetch(url, { method: "POST", headers, body })
} catch (err) {
  fail(`Could not reach ${url}: ${err.message}\n  Is the dev server running?`)
}

const text = await response.text()
console.log(`\n  ${response.status} ${response.statusText}`)

try {
  const json = JSON.parse(text)
  console.log(`  ${JSON.stringify(json, null, 2).split("\n").join("\n  ")}`)

  if (json.status === "duplicate") {
    console.log("\n  Deduplicated — this Message-ID was already processed.")
  } else if (json.documentId) {
    console.log(`\n  Replay this exact message to test dedup:`)
    console.log(`    node scripts/send-inbound-email.mjs --message-id "${messageId}"`)
  }
} catch {
  console.log(`  ${text}`)
}

console.log("")
process.exit(response.ok ? 0 : 1)
