#!/usr/bin/env node
/**
 * Preflight: check every external thing this app depends on and say which is
 * broken, before a customer or a demo finds out for you.
 *
 * Read-only by default — nothing here writes, sends, or changes configuration.
 *
 *   node scripts/health-check.mjs
 *   node scripts/health-check.mjs --live        # also exercise the deployed webhook
 *   node scripts/health-check.mjs --live --from 60123456789
 *
 * `--live` posts one correctly signed webhook to the deployed app and then
 * reads the database to see what the agent did with it. That is the only check
 * that tests *production's* environment rather than your own: the Anthropic key
 * and model that matter in production live in Vercel, not in .env.local, and
 * every other check here would stay green while those were wrong. It was wrong
 * once — a key rotated locally and not in Vercel — and nothing noticed for
 * weeks.
 *
 * It will deliver a real WhatsApp message if the agent decides to answer, so
 * `--from` should be a number you own.
 */

import { createHmac, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const DEPLOYMENT = process.env.DEPLOYMENT_URL ?? "https://precisely-iota.vercel.app"
const TIMEOUT = 25_000

const args = process.argv.slice(2)
const live = args.includes("--live")
const fromIndex = args.indexOf("--from")
const liveFrom = fromIndex !== -1 ? args[fromIndex + 1] : null

// ── .env.local, parsed the same way the dev server sees it ──────────────────
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local")
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .map((line) => {
          const eq = line.indexOf("=")
          return [
            line.slice(0, eq).trim(),
            line
              .slice(eq + 1)
              .trim()
              .replace(/^['"]|['"]$/g, ""),
          ]
        })
    )
  } catch {
    console.error(`Could not read ${file}. Run this from the project root.`)
    process.exit(1)
  }
}

const env = loadEnv()

const checks = []
const record = (state, name, detail) => checks.push({ state, name, detail })
const ok = (name, detail) => record("OK", name, detail)
const warn = (name, detail) => record("WARN", name, detail)
const fail = (name, detail) => record("FAIL", name, detail)

async function attempt(fn) {
  const started = Date.now()
  try {
    return { value: await fn(), ms: Date.now() - started }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), ms: Date.now() - started }
  }
}

function supabase(key, pathAndQuery) {
  return fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT),
  })
}

// ── 0. Are the variables even present? ──────────────────────────────────────
{
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
    "AGENT_ORG_ID",
  ]
  const missing = required.filter((k) => !env[k])
  if (missing.length) fail("Required env vars", `missing: ${missing.join(", ")}`)
  else ok("Required env vars", `all ${required.length} present`)

  const whatsapp = [
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ]
  const absent = whatsapp.filter((k) => !env[k])
  if (absent.length === 0) ok("WhatsApp env vars", "all four present")
  else if (absent.length === whatsapp.length)
    warn("WhatsApp env vars", "none set — drafts only, no channel. That is a supported state.")
  else fail("WhatsApp env vars", `partially configured, missing: ${absent.join(", ")}`)
}

// ── 1. Supabase, through RLS ────────────────────────────────────────────────
{
  const r = await attempt(async () => {
    const res = await supabase(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "organizations?select=id&limit=1")
    return { status: res.status, body: (await res.text()).slice(0, 160) }
  })
  if (r.error) fail("Supabase (anon key)", r.error)
  else if (r.value.status === 200) ok("Supabase (anon key)", `${r.ms}ms, RLS applied`)
  else fail("Supabase (anon key)", `http ${r.value.status} — ${r.value.body}`)
}

// ── 2. Supabase on the service role, which is the agent path ───────────────
let org = null
{
  const r = await attempt(async () => {
    const res = await supabase(
      env.SUPABASE_SERVICE_ROLE_KEY,
      `organizations?select=id,name,whatsapp_auto_reply&id=eq.${env.AGENT_ORG_ID}`
    )
    return { status: res.status, body: await res.text() }
  })
  if (r.error) fail("Supabase (service role)", r.error)
  else if (r.value.status !== 200)
    fail("Supabase (service role)", `http ${r.value.status} — ${r.value.body.slice(0, 160)}`)
  else {
    const rows = JSON.parse(r.value.body)
    org = rows[0] ?? null
    if (!org) fail("AGENT_ORG_ID", `${env.AGENT_ORG_ID} is not an organization in this database`)
    else {
      ok("Supabase (service role)", `${r.ms}ms, org "${org.name}"`)
      if (org.whatsapp_auto_reply) ok("Auto-reply switch", "on")
      else warn("Auto-reply switch", "off — replies will be drafted for a person, never sent")
    }
  }
}

// ── 3. Anthropic, with the local key ───────────────────────────────────────
{
  const model = env.ANTHROPIC_MODEL_CHAT || env.ANTHROPIC_MODEL || "claude-opus-5"
  const r = await attempt(async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: 4, messages: [{ role: "user", content: "hi" }] }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    return { status: res.status, body: (await res.text()).slice(0, 220) }
  })
  if (r.error) fail("Anthropic (local key)", r.error)
  else if (r.value.status === 200) ok("Anthropic (local key)", `${r.ms}ms, ${model} answered`)
  else fail("Anthropic (local key)", `http ${r.value.status} — ${r.value.body}`)
}

// ── 4. The Meta number ──────────────────────────────────────────────────────
if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
  const version = env.WHATSAPP_GRAPH_VERSION ?? "v23.0"
  const r = await attempt(async () => {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}` +
        "?fields=display_phone_number,verified_name,quality_rating",
      {
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(TIMEOUT),
      }
    )
    return { status: res.status, body: await res.text() }
  })
  if (r.error) fail("Meta phone number", r.error)
  else if (r.value.status === 200) {
    const n = JSON.parse(r.value.body)
    ok("Meta phone number", `${n.display_phone_number} (${n.verified_name}), quality ${n.quality_rating}`)
  } else
    fail(
      "Meta phone number",
      `http ${r.value.status} — ${r.value.body.slice(0, 220)}  (an expired token looks like this)`
    )
}

// ── 5. The deployed webhook's GET handshake ────────────────────────────────
if (env.WHATSAPP_VERIFY_TOKEN) {
  const r = await attempt(async () => {
    const url =
      `${DEPLOYMENT}/api/whatsapp?hub.mode=subscribe&hub.verify_token=` +
      `${encodeURIComponent(env.WHATSAPP_VERIFY_TOKEN)}&hub.challenge=preflight`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
    return { status: res.status, body: (await res.text()).trim().slice(0, 80) }
  })
  if (r.error) fail("Deployed webhook handshake", r.error)
  else if (r.value.status === 200 && r.value.body === "preflight")
    ok("Deployed webhook handshake", `${r.ms}ms, challenge echoed`)
  else
    fail(
      "Deployed webhook handshake",
      `http ${r.value.status} "${r.value.body}" — Meta reads this as a failed verification`
    )
}

// ── 6. Is the deployment serving at all? ───────────────────────────────────
{
  const r = await attempt(async () => {
    const res = await fetch(`${DEPLOYMENT}/login`, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT),
    })
    return { status: res.status }
  })
  if (r.error) fail("Deployment", r.error)
  else if (r.value.status < 400) ok("Deployment", `${r.ms}ms, /login http ${r.value.status}`)
  else fail("Deployment", `/login http ${r.value.status}`)
}

// ── 7. End to end against production, if asked ─────────────────────────────
if (live) {
  const from = liveFrom
  if (!from) {
    fail("Live end-to-end", "--live needs --from <number you own>; it may deliver a real message")
  } else if (!env.WHATSAPP_APP_SECRET) {
    fail("Live end-to-end", "WHATSAPP_APP_SECRET is required to sign the webhook")
  } else {
    const wamid = `wamid.PREFLIGHT${randomUUID().replace(/-/g, "").toUpperCase()}`
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "0",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID },
                contacts: [{ profile: { name: "Preflight" }, wa_id: from }],
                messages: [
                  {
                    from,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Preflight check: do you have IPA 99% in stock?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    const signature =
      "sha256=" +
      createHmac("sha256", env.WHATSAPP_APP_SECRET).update(body, "utf8").digest("hex")

    const post = await attempt(async () => {
      const res = await fetch(`${DEPLOYMENT}/api/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": signature },
        body,
        signal: AbortSignal.timeout(TIMEOUT),
      })
      return { status: res.status }
    })

    if (post.error) fail("Live webhook POST", post.error)
    else if (post.value.status !== 200) fail("Live webhook POST", `http ${post.value.status}`)
    else {
      ok("Live webhook POST", `${post.ms}ms, acknowledged (Meta allows only a few seconds)`)

      // The handler answers after responding, via `after()`, so the outcome
      // only shows up in the database a few seconds later.
      //
      // The run is found by `input_ref`, which is the id of the message we just
      // sent, and never by "the most recent run". Taking the latest row races
      // the handler: before it opens its own run the newest one is the previous
      // check's, so a preflight could report a stale failure as this one's — or
      // worse, a stale success.
      let outcome = null
      for (let i = 0; i < 15 && !outcome; i++) {
        await new Promise((r) => setTimeout(r, 2000))

        const res = await supabase(
          env.SUPABASE_SERVICE_ROLE_KEY,
          `conversation_messages?select=id&external_id=eq.${wamid}&direction=eq.inbound`
        )
        const [inbound] = res.ok ? await res.json() : []
        if (!inbound) continue

        const runs = await supabase(
          env.SUPABASE_SERVICE_ROLE_KEY,
          `agent_runs?select=status,model,cost_usd,error&input_ref=eq.${inbound.id}`
        )
        const [run] = runs.ok ? await runs.json() : []
        if (run && run.status !== "running") outcome = run
      }

      if (!outcome) warn("Live end-to-end", "no finished run within 30s — check the Vercel logs")
      else if (outcome.status === "failed")
        fail(
          "Live end-to-end",
          `production run failed on ${outcome.model}: ${String(outcome.error).slice(0, 220)}`
        )
      else
        ok(
          "Live end-to-end",
          `production answered on ${outcome.model}, $${outcome.cost_usd} — check your phone`
        )
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
const width = Math.max(...checks.map((c) => c.name.length))
console.log()
for (const c of checks) console.log(`[${c.state.padEnd(4)}] ${c.name.padEnd(width)}  ${c.detail}`)

const failed = checks.filter((c) => c.state === "FAIL")
const warned = checks.filter((c) => c.state === "WARN")
console.log()
console.log(
  failed.length
    ? `${failed.length} check(s) FAILED${warned.length ? `, ${warned.length} warning(s)` : ""}.`
    : `All checks passed${warned.length ? `, with ${warned.length} warning(s)` : ""}.`
)
if (!live) console.log("Add --live --from <your number> to test production's own key and model.")

process.exit(failed.length ? 1 : 0)
