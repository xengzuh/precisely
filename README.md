# Chemical Distribution ERP

Inventory and order management for small chemical distributors, with a **WhatsApp assistant that
answers customers and takes their orders** — replying in seconds, reading live stock, and writing
the order into the system without anyone re-typing it.

The AI is not bolted on. It operates the app through the same typed, audited path a person uses,
and never gets a code path of its own.

**Status:** in active development, deployed on Vercel. Stock, orders, and invoicing work end to
end; the WhatsApp assistant answers and records orders unattended. Not yet in use by a real
distributor. Accounting and logistics are the intended direction, not a current claim.

```
Next.js 16 · TypeScript (strict) · Supabase (Postgres + RLS) · Tailwind v4 · shadcn/ui · Anthropic API
22 tables · 16 Postgres functions · 25 registry actions · 31 routes · 135 tests
```

---

## The problem

Chemical distributors don't run on tidy web forms. They run on emailed PDFs, WhatsApp
confirmations, and a buyer who writes *"2 drums IPA 99%"* when your catalog says
`SOL-IPA-99 — Isopropyl Alcohol 99%, base unit L`. Someone re-types that into an ERP several
dozen times a day.

That is a good fit for an agent, and a terrible fit for a naive one. Get a quantity wrong and you
ship 400 litres instead of 400 kilograms. Match the wrong product and a customer expecting caustic
soda flakes receives a 32% solution — about a third of the sodium hydroxide they ordered, in a form
they may not be able to use.

So the interesting problem isn't "call a model to read a PDF". It's building a system where an
agent's mistakes are **bounded, visible, and reversible**.

---

## Architecture

### One write path

Every business operation is a typed action. The UI and the agents call the same registry.

```mermaid
flowchart LR
    UI[UI form] --> RA[runAction]
    AG[AI agent] --> RA
    RA --> P{policy gate}
    P -->|auto| EX[execute via Postgres RPC]
    P -->|gated| Q[queue for approval]
    EX --> AU[(audit row)]
    Q --> AU
```

There is no second list of agent capabilities to keep in sync. A tool the agent can call *is* an
action, which means approval gating, the audit trail, and undo come for free — and it is
structurally impossible to give an agent a capability the audit log doesn't cover.

```ts
// A server action is a thin wrapper. Nothing else.
export async function addProduct(formData: FormData) {
  await invoke(createProduct, { sku: ..., name: ... })
}
```

Human-initiated actions execute immediately — the person clicking the button is the approval — but
are still audited. Agent-initiated actions are gated by the organization's autonomy policy, by a
value threshold, or by the action's own risk classification. That last one is not overridable:
an org can put `create_sales_order` on auto, but an individual order the action flags as high risk
still stops for a human.

### The domain model most ERPs get wrong

Quantities are `numeric(14,4)`, never `integer` — chemicals ship in fractional kilograms and litres.

- **Base unit of measure.** Every quantity in the database is stored in the product's base unit
  (`kg`, `L`, or `ea`). Conversion happens at the edges.
- **Density.** What makes kg ↔ L conversion possible. A liquid without one *cannot* accept an order
  in the other unit — that raises an error rather than assuming 1.0, because assuming 1.0 for
  isopropyl alcohol overstates a delivery by 27%.
- **Package types.** Customers order in drums, IBCs, and bags; stock is held in base units.
  "10 drums" only becomes a quantity if a drum is defined.
- **Batch / lot.** Products with a shelf life hold their balance on `batches`, not on the product
  row, and allocation is first-expired-first-out — because customers reject short-dated material.

### An append-only ledger

Every stock change writes a `stock_moves` row. The table is append-only, enforced by restrictive
RLS policies blocking `UPDATE` and `DELETE`. Balances on `products` and `batches` are derived state
maintained by SQL functions, never written from application code.

This is what makes agent actions reversible: to undo, post the inverse move. The ledger keeps the
whole story — received, then unreceived — rather than quietly rewriting history.

Operations that must be atomic live in Postgres and are called via RPC: `post_stock_move`,
`create_sales_order`, `allocate_sales_order`, `fulfil_sales_order`, `create_invoice_from_order`,
`receive_purchase_order`. This replaced non-atomic read-modify-write on stock levels, where two
concurrent sales could read the same balance and oversell.

### Tenancy, and the boundary where RLS stops helping

Tenancy is per-organization. Every tenant-owned row carries `org_id`, and RLS policies are uniformly
`using (is_org_member(org_id))`.

Signed-in requests use the anon key, so Postgres enforces isolation. **Agent runs triggered by
webhooks have no user session and use the service role, which bypasses RLS entirely.** On that path,
`org_id` filtering is application code, and a missing filter is a cross-tenant data leak.

Building this surfaced a real vulnerability: five RPCs took only a record id, with no org parameter.
Under RLS that was safe. On the agent path it meant an id belonging to another tenant would have been
honoured. Fixed by asserting ownership before every such call, and by routing all service-role access
through a client that cannot be constructed without an organization.

### The agent layer

`lib/ai/` is the only place that talks to Anthropic.

**PO intake** is a single structured-output call rather than a tool-calling loop. For a catalog of a
few hundred SKUs, putting the whole catalog behind a cached prompt prefix is cheaper and more
accurate than letting the model search one line at a time — it can see every candidate at once.

The design rule that matters:

> An agent that cannot confidently identify a product must leave `product_id` null and flag the line
> for review, not guess. A wrong chemical match is a wrong chemical on a truck.

Unmatched lines block the order from being confirmed or allocated, enforced in SQL as well as in the
UI, so a half-understood order physically cannot reach the warehouse.

Prices work the same way. The model is forbidden from supplying a price the document doesn't state;
application code falls back to the catalog list price. A deterministic lookup can't mis-transcribe a
figure — and a wrong price is an invoice someone has to retract.

**The system learns.** When a human resolves an unmatched line, that correction is recorded as a
per-customer alias and resolved deterministically on future documents — before the model runs.
Repeat orders, which are most of a distributor's volume, converge on needing no model call at all.

**The WhatsApp assistant** answers customers directly, and takes their orders. It is a tool loop
over the same registry — it reads the live catalog through `search_products` rather than from
anything baked into a prompt, so it cannot describe stock that isn't there.

How much it may say on its own is decided by what the sentence *commits the business to*, not by how
confident the model sounds:

| The customer asked | It answers | Why |
|---|---|---|
| What do you stock? Is it in? | unattended | A fact, read live at the moment of asking |
| How much is it? When can I get it? | drafts for a person | A price is an offer; a date is a promise |
| Anything about hazards or handling | escalates, never answers | Legal and safety liability. A person answers, citing the SDS |
| I'd like to order X | unattended, *once the order is on record* | See below |

That last row is the interesting one. An order reply is a supply commitment right up until the
order actually exists — after which it's a receipt for a row a colleague is about to confirm, which
is the same class of statement as an availability answer. So the exemption turns on a database
write having happened, never on the model reporting that it did.

What the assistant writes is a **draft** sales order. Confirming, pricing, allocating stock, and
shipping stay separate actions that a person performs. Two mistakes are ruled out by the schema
rather than by instructions: there is no price field on the tool, so a price can only come from the
catalog; and there is no way to pass a converted quantity, so *"three drums"* stays three drums until
`resolveToBase` turns it into 600 L. The model never does the arithmetic that decides how much
leaves the warehouse.

An unrecognised number simply isn't offered the tool. Withholding the capability is stronger than
granting it and refusing later.

**Agents never author regulatory data.** Hazard class, UN number, packing group, and SDS content
carry shipping and legal liability. When that layer lands it will be a curated table agents *read
and cite*, never write. This is enforced structurally: no action exists that writes those fields.

---

## Running it

Requires Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local   # fill in the values below
```

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server-only — never NEXT_PUBLIC_
ANTHROPIC_API_KEY=             # server-only
AGENT_ORG_ID=                  # which org unattended agent work belongs to
WHATSAPP_PHONE_NUMBER_ID=      # optional, enables the WhatsApp assistant
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
INBOUND_WEBHOOK_SECRET=        # optional, enables the email webhook
```

`AGENT_ORG_ID` is not a convenience. Webhook-triggered runs have no user session and use the
service role, so an org id taken from the request body would let any sender write into any tenant
they can name.

In the Supabase SQL editor, run in order:

1. `supabase/schema.sql` — tables, RLS, triggers
2. `supabase/functions.sql` — the atomic operations
3. `supabase/seed.sql` — a sample distributor (edit `v_email` first)

Then `notify pgrst, 'reload schema';` so PostgREST picks up the new tables.

Sign-up is invite-only: create your user in Dashboard → Authentication → Users.

```bash
npm run dev
```

### Trying the intake agent

```bash
npm run inbound
```

Posts an HMAC-signed message to the inbound webhook without needing a mail provider. The default
payload deliberately includes a quoted reply mentioning a *different* product, so a regression in
quoted-history stripping shows up as a changed order.

```bash
node scripts/send-inbound-email.mjs --text "3 x 250 L drums NaOH 32%"
node scripts/send-inbound-email.mjs --message-id "<seen@before>"   # dedup
node scripts/send-inbound-email.mjs --bad-signature                # expect 401
```

### Trying the WhatsApp assistant

No Meta account needed. `POST /api/dev/chat` runs a message through the whole path — catalog
lookups, the reply policy, order recording — and returns what happened. It is dev-only, gated in
`proxy.ts`.

```bash
curl -X POST localhost:3000/api/dev/chat -H 'content-type: application/json' \
  -d '{"from":"60123456789","message":"Can I order 3 drums of IPA 99%?"}'
```

```json
{ "status": "sent", "orderId": "80dd4567-…", "conversationId": "55a6626c-…" }
```

That number belongs to a seeded customer, so it resolves to an account and the order tool is
offered. Change it to an unknown number and the assistant declines to record anything — the tool is
withheld rather than offered and refused.

---

## Testing

```bash
npm run test        # Vitest
npm run typecheck   # tsc --noEmit, zero errors
npm run lint
```

135 tests, covering the places where a silently wrong answer ships as a wrong quantity of a chemical:
unit conversion and the missing-density error, package expansion, price resolution, webhook signature
verification, catalog search term splitting, and the two gates that decide whether an agent acts
alone — the autonomy policy and the reply policy. No database or network — these are pure functions
by design.

They earn their place. The email tests caught a regex that required every quoted line to end in a
newline, so the final line of a reply chain never matched and nothing was stripped. The reply-policy
tests pin down something easier to get wrong: that recording an order unlocks the order reply and
nothing else, and can never downgrade a regulatory escalation.

---

## Known gaps

Honest list of what isn't done:

- **Multi-lot allocation.** A line can only draw from one lot; an order larger than a single lot is
  refused rather than silently corrupting the ledger. Needs a join table.
- **Customer-specific pricing.** Everyone gets list price. Real distributors run negotiated rates.
- **No delete-line action.** An order containing something you genuinely don't stock can't proceed.
- **Regulatory layer.** CAS/UN/GHS/SDS deferred; the schema leaves room for it.
- **The invoice PDF** lacks the seller's registration details a Malaysian SST invoice legally
  requires.
- **The WhatsApp assistant is unproven on real traffic.** It has been exercised end to end against
  the live Cloud API, but a customer-facing model is only really tested by customers, and the split
  between what it may say and what it must hand over will move once it meets them.

---

## Layout

```
app/(dashboard)/        inbox, conversations, agents, customers, orders, invoices,
                        inventory, suppliers, purchase-orders, reports, settings
app/api/whatsapp/       the Cloud API webhook — verifies, acknowledges, then answers
lib/erp/actions/        the action registry — the only write path
lib/erp/                uom, pricing, aliases, search, phone, email parsing, queries
lib/ai/                 Anthropic client, registry→tool bridge, the two agents
lib/whatsapp/           Meta and Twilio transports behind one interface
content/company.md      what the assistant knows about the business, in prose
supabase/               schema, atomic functions, seed, reset
proxy.ts                Next 16's renamed middleware — session refresh + auth
```
