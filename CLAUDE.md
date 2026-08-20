# CLAUDE.md — AI-native ERP for chemical distribution

An ERP for small-to-medium chemical distributors, being built so that AI agents
can operate it: taking purchase orders from emailed documents, raising invoices,
and managing stock. The agent layer is not bolted on — the same typed action
registry backs both the UI and the agents.

## Stack (strict — do not deviate)

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 App Router |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui only — no other UI libraries |
| Database / Auth | Supabase (PostgreSQL + Auth) — no other DB or auth |
| Icons | Lucide React |
| LLM | Anthropic API (`@anthropic-ai/sdk`), model `claude-opus-5` |

## Hard rules

- **No additional UI libraries.** Only shadcn/ui components. No MUI, no Chakra,
  no Ant Design, no Headless UI. The shadcn wrappers here are built on
  `@base-ui/react` — use the wrappers in `components/ui/`, never the primitive
  directly.
- **Supabase for all DB and auth.** No Prisma, no Drizzle, no NextAuth, no raw
  SQL clients. Use `@supabase/supabase-js` and `@supabase/ssr`.
- **TypeScript strict mode.** `npm run typecheck` must pass with zero errors.
- **No `any` types** unless genuinely unavoidable and explicitly commented.

## The three rules that keep this system correct

These are not style preferences. Breaking any one of them causes data loss,
a cross-tenant leak, or an unauditable agent.

### 1. Every write goes through the action registry

`lib/erp/actions/` is the only place business operations are defined. A server
action or an agent tool calls `runAction(definition, input, ctx)`; nothing
writes to Supabase directly.

This is what gives approval gating, the audit trail, and undo for free — and
what guarantees an agent can never reach a code path a user could not.

```ts
// A server action is a thin wrapper. Nothing else.
export async function addProduct(formData: FormData) {
  await invoke(createProduct, { sku: ..., name: ... })
}
```

Human-initiated actions execute immediately (the person clicking the button is
the approval) but are still audited. Agent-initiated actions are gated by the
org's `autonomy_policies`, by value threshold, or by the action's own risk
classification.

Reads are exempt and live in `lib/erp/queries.ts`.

### 2. Every tenant-owned row carries `org_id`, and the agent path has no RLS

Tenancy is per-**organization**, never per-user. `memberships` maps users to
orgs; RLS policies are uniformly `using (is_org_member(org_id))`.

Signed-in requests use the anon key, so RLS enforces isolation. **Agent runs
triggered by webhooks or schedules have no user session and use the service
role, which bypasses RLS entirely.** On that path, `org_id` filtering is
application code, and a missing filter is a cross-tenant data leak.

- Every query inside an action must filter `.eq("org_id", ctx.orgId)`, or call
  an RPC that takes `p_org`.
- Service-role access only via `getServiceClient(orgId)` in
  `lib/supabase/service.ts`, which cannot be constructed without an org.

### 3. Agents never author regulatory data

Hazard class, UN number, packing group, and SDS content carry shipping and
legal liability. When the regulatory layer lands it will be a curated
`substances` table that agents **read and cite** — never write.

Enforce this structurally: do not add an action that writes those fields. An
agent that cannot confidently identify a product must leave `product_id` null
and set `needs_review`, not guess. A wrong chemical match is a wrong chemical
on a truck.

## Domain vocabulary

- **Base UoM** — `kg`, `L`, or `ea`. Every quantity in the database is stored in
  the product's base unit. Conversion happens at the edges, via `lib/erp/uom.ts`.
- **Density** (`density_kg_per_l`) — what makes kg ↔ L conversion possible. A
  liquid without one cannot accept an order in the other unit; that is an error,
  never an assumed 1.0.
- **Package type** — how the product physically ships: "200 L drum", "25 kg bag",
  "1000 L IBC". Customers order in packages; stock is held in base units.
- **Batch / lot** — a specific production run with an expiry date. Products with
  `is_batch_tracked` hold their balance on `batches`, **not** on
  `products.qty_on_hand` (which stays 0). Compute availability by summing
  batches, or use `listProducts()` which already does.
- **FEFO** — first-expired-first-out. The allocation default, because customers
  reject short-dated material.
- **Available** — `qty_on_hand − qty_reserved`. Reserved stock is promised to an
  allocated order and is not sellable.

## Data model

Quantities are `numeric(14,4)`, never `integer` — chemicals ship in fractional
kg and L. Money is `numeric(14,2)`; unit prices are `numeric(14,4)`.

**All stock changes write a `stock_moves` row.** That table is append-only
(restrictive RLS blocks UPDATE and DELETE) and is the reason agent actions are
reversible: to undo, post the inverse via `reverse_stock_move`. Balances on
`products` and `batches` are derived state maintained by the SQL functions —
never write them from application code.

Operations that must be atomic live in `supabase/functions.sql` and are called
via `supabase.rpc(...)`: `post_stock_move`, `create_sales_order`,
`allocate_sales_order` (FEFO), `fulfil_sales_order`, `create_invoice_from_order`,
`create_purchase_order`, `receive_purchase_order`.

## Database setup

Run in order in the Supabase SQL editor:

1. `supabase/schema.sql` — tables, RLS, triggers
2. `supabase/functions.sql` — the atomic operations
3. `supabase/seed.sql` — sample chemical distributor (edit `v_email` first)

None of these are idempotent — re-running `schema.sql` over an existing schema
fails with 42P07. To rebuild, run `supabase/reset.sql` first (destructive), then
the three above. After any of them, `notify pgrst, 'reload schema';` so
PostgREST picks up the new tables; otherwise the app sees `PGRST002`.

All functions in both files are `plpgsql`, deliberately: a `language sql` body
is fully resolved at `CREATE` time, and the SQL editor fails to see tables
created earlier in the same script.

Sign-up is invite-only: create users in Dashboard → Authentication → Users.

Regenerate types after any schema change: `npm run db:types` (needs a linked
Supabase project). `types/database.ts` is currently hand-maintained — keep it in
sync, and note that row shapes must be `type` aliases, not `interface`, or
Supabase's generics silently collapse every table to `never`.

## Routing

```
app/
  (auth)/            login, onboarding
  (dashboard)/       layout.tsx = sidebar + bottom nav shell
    dashboard/
    inbox/ agents/                   — agent surface (agents/policies/ = autonomy matrix)
    customers/ orders/ invoices/     — sell side, each with [id]/
    inventory/ sales/ scanner/       — stock ("sales" is the movement ledger)
    suppliers/ purchase-orders/      — buy side
    reports/ settings/
  api/reports/           React-PDF route handlers (runtime = "nodejs")
  api/invoices/[id]/pdf  the customer-facing invoice
  api/inbound/email      HMAC-verified webhook → PO intake agent
proxy.ts             Next 16's renamed middleware.ts — session refresh + auth redirect
```

`/orders` is sales orders; purchasing lives at `/purchase-orders` and is
labelled "Purchasing" in the nav. Detail pages are server components — only the
interactive parts (workflow buttons, line editor, dialogs) are `"use client"`.

## The agent layer

`lib/ai/` is the only place that talks to Anthropic.

- **`client.ts`** — the single client. Model `claude-opus-5`, adaptive thinking
  (on by default), effort `high` for extraction and `xhigh` for agent loops.
  `assertNotRefused()` must be called before reading any response: Opus 5's
  classifiers can decline with a 200 and an empty `content`, and indexing
  `content[0]` throws on exactly that case.
- **`tools.ts`** — generates tool definitions from the action registry. There is
  no second list of agent capabilities. A gated action returns
  `pending_approval` to the model rather than executing.
- **`run.ts`** — opens and closes an `agent_runs` row around every invocation,
  with token counts and cost.
- **`agents/po-intake.ts`** — one `messages.parse()` call with a zod output
  schema. The catalog and customer list sit behind a `cache_control` breakpoint
  so they are cache-reads on every document after the first; the document goes
  last because it is the volatile part.

Two env vars, both server-only, neither with a `NEXT_PUBLIC_` prefix:
`ANTHROPIC_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for the agent path.
`INBOUND_WEBHOOK_SECRET` + `INBOUND_ORG_ID` enable the email webhook.

**The webhook resolves `org_id` from server config, never from the payload.**
That path runs on the service role with no RLS, so an org id taken from the
request body would let any sender write into any tenant they can name.

## Testing

`npm run test` (Vitest, `tests/*.test.ts`). Covers the things where a silent
wrong answer ships as a wrong quantity of a chemical: UoM conversion and the
missing-density error, package expansion, and the `shouldGate` autonomy
decision. No DB or network — these are pure functions by design.

## Styling conventions

- **Mobile-first** — base styles target mobile, then `sm:` → `md:` → `lg:`.
- `sm:` ≥640px · `md:` ≥768px (sidebar breakpoint) · `lg:` ≥1024px
- Tailwind utilities only; no inline `style` props unless unavoidable.
- Use the shadcn CSS variable system (`bg-background`, `text-foreground`,
  `bg-primary`) — **never hard-code color values.**

## Component conventions

- Server Components by default; `"use client"` only for hooks, browser APIs, or
  event handlers.
- shadcn primitives in `components/ui/`; composites in `components/`.
- Extract sub-components when a file exceeds ~150 lines.
- **Supabase `.select()` strings must be a single string literal.** Concatenating
  across lines widens the type to `string` and silently destroys result-type
  inference.

## Commands

```
npm run dev         # Next dev server (Turbopack)
npm run build       # production build
npm run typecheck   # tsc --noEmit — must be clean
npm run lint        # eslint
npm run db:types    # regenerate types/database.ts from the linked project
```
