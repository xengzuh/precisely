-- ============================================================================
-- ERP for chemical distribution — full schema
--
-- Run this whole file in Supabase Dashboard → SQL Editor on a fresh project.
-- Then run functions.sql, then (optionally) seed.sql.
--
-- Replaces the old schema.sql / phase4.sql / phase5a.sql / phase5b.sql.
--
-- Conventions
--   * Every tenant-owned table carries org_id and is protected by RLS via
--     is_org_member(). There is no per-user ownership.
--   * Quantities are numeric(14,4), never integer — chemicals ship in
--     fractional kg and L.
--   * All stock changes are recorded in stock_moves. Balances on products and
--     batches are derived state maintained by functions.sql, never by the app.
-- ============================================================================

-- Pin the creation schema. The Supabase SQL editor runs with a search_path of
-- `"$user", public, extensions`, and Postgres silently skips entries in that
-- list that do not exist or that you lack USAGE on — so if public is skipped,
-- unqualified CREATEs land in extensions where PostgREST will never see them.
-- With this set, a missing public schema is a loud error instead.
set search_path = public;

-- Belt and braces: this script defines functions over tables it creates in the
-- same run, and the Supabase SQL editor does not always resolve those at CREATE
-- time. pg_restore disables the same check for the same reason. Every function
-- below is plpgsql, so bodies are checked on first call regardless.
set check_function_bodies = off;

-- ── Tenancy ─────────────────────────────────────────────────────────────────

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    text not null default 'MYR',
  tax_rate    numeric(6,4) not null default 0.0600,   -- 6% SST
  tax_label   text not null default 'SST',
  country     text not null default 'MY',
  locale      text not null default 'en-MY',
  timezone    text not null default 'Asia/Kuala_Lumpur',
  created_at  timestamptz not null default now()
);

create table memberships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  role       text not null default 'operator'
             check (role in ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index memberships_org_idx on memberships (org_id);

-- SECURITY DEFINER so the function itself is not subject to RLS on
-- memberships. Without this, a policy of the form
-- `using (is_org_member(org_id))` on memberships recurses infinitely.
--
-- plpgsql rather than sql: a `language sql` body is fully parsed at CREATE
-- time and its tables must already be resolvable, which the Supabase SQL
-- editor fails to do for a table created earlier in the same script. plpgsql
-- resolves relations on first call instead. Nothing is lost — SECURITY DEFINER
-- functions are never inlined by the planner, so the sql form had no edge.
create or replace function is_org_member(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1 from public.memberships
    where org_id = target and user_id = auth.uid()
  );
end;
$$;

create or replace function has_org_role(target uuid, roles text[])
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1 from public.memberships
    where org_id = target and user_id = auth.uid() and role = any(roles)
  );
end;
$$;

-- Whoever creates an organization becomes its owner. Doing this in a trigger
-- keeps org creation atomic — there is no window where an org exists with no
-- members and is therefore invisible to everyone including its creator.
create or replace function handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Null when running from the SQL editor or a service-role connection, where
  -- there is no end user to make owner. seed.sql wires membership explicitly.
  if auth.uid() is not null then
    insert into public.memberships (user_id, org_id, role)
    values (auth.uid(), new.id, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_organization_created
  after insert on organizations
  for each row execute function handle_new_organization();

-- ── Document numbering ──────────────────────────────────────────────────────

create table document_sequences (
  org_id     uuid not null references organizations(id) on delete cascade,
  kind       text not null check (kind in ('sales_order', 'purchase_order', 'invoice')),
  prefix     text not null,
  next_value bigint not null default 1,
  primary key (org_id, kind)
);

-- ── Catalog ─────────────────────────────────────────────────────────────────

create table products (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,

  sku               text not null,
  name              text not null,
  description       text,

  -- Operational chemical identity. Regulatory identity (CAS, UN number, GHS
  -- hazard class, packing group) lands in a later phase as a curated
  -- `substances` table referenced by substance_id. It is deliberately NOT
  -- free-text on the product: those values carry shipping and legal liability
  -- and must never be authored by an agent.
  grade             text,
  concentration_pct numeric(7,4),
  substance_id      uuid,

  base_uom          text not null default 'ea' check (base_uom in ('kg', 'L', 'ea')),
  density_kg_per_l  numeric(10,5),   -- required to convert between kg and L

  cost_price        numeric(14,4) not null default 0,
  list_price        numeric(14,4) not null default 0,

  reorder_point     numeric(14,4),
  reorder_qty       numeric(14,4),

  is_batch_tracked  boolean not null default false,
  shelf_life_days   integer,

  -- Balances for non-batch-tracked products. For batch-tracked products the
  -- authoritative balances live on `batches` and these stay at 0.
  qty_on_hand       numeric(14,4) not null default 0,
  qty_reserved      numeric(14,4) not null default 0,

  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (org_id, sku),
  constraint products_density_required_for_mass_volume
    check (base_uom = 'ea' or density_kg_per_l is null or density_kg_per_l > 0)
);

create index products_org_idx on products (org_id);
create index products_org_name_idx on products (org_id, name);

-- How a product is physically packaged. qty_per_package is expressed in `uom`,
-- which may differ from the product's base_uom (a product costed in kg can be
-- sold in 200 L drums) — conversion goes through density_kg_per_l.
create table package_types (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  name             text not null,                  -- '200 L drum', '25 kg bag', '1000 L IBC'
  qty_per_package  numeric(14,4) not null check (qty_per_package > 0),
  uom              text not null check (uom in ('kg', 'L', 'ea')),
  tare_kg          numeric(10,4),
  is_default       boolean not null default false,
  created_at       timestamptz not null default now()
);

create index package_types_product_idx on package_types (product_id);

create table batches (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  lot_code     text not null,
  mfg_date     date,
  expiry_date  date,
  qty_on_hand  numeric(14,4) not null default 0,   -- in the product's base_uom
  qty_reserved numeric(14,4) not null default 0,
  created_at   timestamptz not null default now(),

  unique (product_id, lot_code),
  constraint batches_reserved_within_on_hand check (qty_reserved <= qty_on_hand),
  constraint batches_non_negative check (qty_on_hand >= 0 and qty_reserved >= 0)
);

-- FEFO allocation reads this index.
create index batches_fefo_idx on batches (product_id, expiry_date nulls last)
  where qty_on_hand > 0;

-- ── Stock ledger ────────────────────────────────────────────────────────────

-- Append-only. Every stock change writes exactly one row, including opening
-- balances and CSV imports. This is what makes agent actions auditable and
-- reversible: to undo a move, post its inverse and link it via reverses_id.
create table stock_moves (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete restrict,
  batch_id        uuid references batches(id) on delete restrict,

  direction       text not null check (direction in ('in', 'out')),
  qty             numeric(14,4) not null check (qty > 0),   -- always in base_uom

  -- What the human or agent actually entered, before conversion. Kept for
  -- audit: "10 drums" is more meaningful in a dispute than "2000 L".
  entered_qty     numeric(14,4),
  entered_uom     text,

  unit_cost       numeric(14,4),
  reason          text not null
                  check (reason in ('opening', 'import', 'sale', 'purchase',
                                    'adjustment', 'return', 'write_off', 'reversal')),

  ref_type        text,      -- 'sales_order' | 'purchase_order' | 'invoice' | null
  ref_id          uuid,

  reverses_id     uuid references stock_moves(id),
  agent_action_id uuid,      -- FK added after agent_actions is created

  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index stock_moves_org_created_idx on stock_moves (org_id, created_at desc);
create index stock_moves_product_idx on stock_moves (product_id, created_at desc);
create index stock_moves_ref_idx on stock_moves (ref_type, ref_id);

-- ── Parties ─────────────────────────────────────────────────────────────────

create table customers (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  name               text not null,
  email              text,
  phone              text,
  billing_address    text,
  delivery_address   text,
  tax_id             text,
  payment_terms_days integer not null default 30,
  credit_limit       numeric(14,2),
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create index customers_org_idx on customers (org_id);
create index customers_org_email_idx on customers (org_id, lower(email));

create table suppliers (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  name               text not null,
  email              text,
  phone              text,
  billing_address    text,
  tax_id             text,
  payment_terms_days integer not null default 30,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create index suppliers_org_idx on suppliers (org_id);

-- ── Sales orders ────────────────────────────────────────────────────────────

create table sales_orders (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  customer_id    uuid references customers(id) on delete restrict,

  order_no       text not null,
  customer_ref   text,          -- the customer's own PO number
  status         text not null default 'draft'
                 check (status in ('draft', 'confirmed', 'allocated',
                                   'fulfilled', 'invoiced', 'cancelled')),
  source         text not null default 'manual'
                 check (source in ('manual', 'agent', 'import')),

  order_date     date not null default current_date,
  requested_date date,

  currency       text not null default 'MYR',
  subtotal       numeric(14,2) not null default 0,
  tax            numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,

  notes          text,
  needs_review   boolean not null default false,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (org_id, order_no)
);

create index sales_orders_org_status_idx on sales_orders (org_id, status, order_date desc);
create index sales_orders_customer_idx on sales_orders (customer_id);

create table sales_order_lines (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  order_id         uuid not null references sales_orders(id) on delete cascade,
  line_no          integer not null,

  product_id       uuid references products(id) on delete restrict,
  -- Verbatim text from the source document. When an agent could not confidently
  -- match a line to a catalog product, product_id stays null, this holds what
  -- the PO literally said, and needs_review is true.
  description_raw  text,

  qty              numeric(14,4) not null check (qty > 0),   -- in base_uom
  uom              text not null,
  package_type_id  uuid references package_types(id),
  package_count    numeric(14,4),

  unit_price       numeric(14,4) not null default 0,
  line_total       numeric(14,2) not null default 0,

  batch_id         uuid references batches(id),
  qty_allocated    numeric(14,4) not null default 0,

  match_confidence numeric(4,3) check (match_confidence between 0 and 1),
  needs_review     boolean not null default false,
  notes            text,

  unique (order_id, line_no)
);

create index sales_order_lines_order_idx on sales_order_lines (order_id);

-- ── Purchase orders ─────────────────────────────────────────────────────────

create table purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete restrict,

  order_no      text not null,
  status        text not null default 'draft'
                check (status in ('draft', 'ordered', 'partial', 'received', 'cancelled')),
  source        text not null default 'manual'
                check (source in ('manual', 'agent', 'import')),

  order_date    date not null default current_date,
  expected_date date,

  currency      text not null default 'MYR',
  subtotal      numeric(14,2) not null default 0,
  tax           numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,

  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, order_no)
);

create index purchase_orders_org_status_idx on purchase_orders (org_id, status, order_date desc);

create table purchase_order_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  order_id        uuid not null references purchase_orders(id) on delete cascade,
  line_no         integer not null,

  product_id      uuid not null references products(id) on delete restrict,
  qty             numeric(14,4) not null check (qty > 0),
  uom             text not null,
  package_type_id uuid references package_types(id),

  unit_cost       numeric(14,4) not null default 0,
  line_total      numeric(14,2) not null default 0,

  qty_received    numeric(14,4) not null default 0,
  lot_code        text,
  expiry_date     date,

  unique (order_id, line_no)
);

create index purchase_order_lines_order_idx on purchase_order_lines (order_id);

-- ── Invoices ────────────────────────────────────────────────────────────────

create table invoices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  order_id    uuid references sales_orders(id) on delete restrict,
  customer_id uuid references customers(id) on delete restrict,

  invoice_no  text not null,
  status      text not null default 'draft'
              check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),

  issue_date  date not null default current_date,
  due_date    date,

  currency    text not null default 'MYR',
  subtotal    numeric(14,2) not null default 0,
  tax         numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,

  pdf_path    text,
  sent_at     timestamptz,
  paid_at     timestamptz,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),

  unique (org_id, invoice_no)
);

create index invoices_org_status_idx on invoices (org_id, status, issue_date desc);

create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  line_no     integer not null,

  product_id  uuid references products(id) on delete restrict,
  description text not null,
  qty         numeric(14,4) not null,
  uom         text not null,
  unit_price  numeric(14,4) not null default 0,
  line_total  numeric(14,2) not null default 0,

  unique (invoice_id, line_no)
);

create index invoice_lines_invoice_idx on invoice_lines (invoice_id);

-- ── Agent runtime ───────────────────────────────────────────────────────────

create table agent_runs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  agent      text not null,                 -- 'po_intake' | 'reorder' | ...
  trigger    text not null default 'manual' -- 'manual' | 'email' | 'schedule' | 'api'
             check (trigger in ('manual', 'email', 'schedule', 'api')),
  status     text not null default 'running'
             check (status in ('running', 'succeeded', 'failed', 'cancelled')),

  model      text,
  input_ref  text,          -- e.g. inbound_documents.id
  tokens_in  integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd   numeric(12,6) not null default 0,

  error      text,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- Cache reads cost a tenth of a fresh read, so a prefix that is never re-read
-- inside the cache TTL is pure overhead. Folding these into tokens_in hides
-- exactly that, which is why they get their own columns.
alter table agent_runs add column cache_read_tokens  bigint not null default 0;
alter table agent_runs add column cache_write_tokens bigint not null default 0;

create index agent_runs_org_idx on agent_runs (org_id, started_at desc);

-- One row per business operation attempted through runAction(), whether by a
-- human or an agent. This is the audit log and the approval queue at once.
create table agent_actions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  run_id      uuid references agent_runs(id) on delete set null,

  action      text not null,
  args        jsonb not null default '{}'::jsonb,
  risk        text not null default 'low' check (risk in ('low', 'medium', 'high')),
  actor       text not null default 'user' check (actor in ('user', 'agent')),

  status      text not null default 'proposed'
              check (status in ('proposed', 'approved', 'rejected',
                                'executed', 'failed', 'reverted')),

  result      jsonb,
  error       text,
  summary     text,          -- human-readable one-liner for the approval inbox

  proposed_at timestamptz not null default now(),
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejected_reason text,
  executed_at timestamptz,
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id)
);

create index agent_actions_org_status_idx on agent_actions (org_id, status, proposed_at desc);
create index agent_actions_run_idx on agent_actions (run_id);

alter table stock_moves
  add constraint stock_moves_agent_action_fk
  foreign key (agent_action_id) references agent_actions(id) on delete set null;

-- Per-org autonomy matrix. An action with no row here falls back to the
-- action's own default mode in application code (which is 'approve').
create table autonomy_policies (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  action           text not null,
  mode             text not null default 'approve'
                   check (mode in ('auto', 'approve', 'off')),
  -- Above this value the action always requires approval regardless of mode.
  threshold_amount numeric(14,2),
  updated_at       timestamptz not null default now(),

  unique (org_id, action)
);

-- ── Inbound documents ───────────────────────────────────────────────────────

create table inbound_documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,

  source        text not null check (source in ('upload', 'email', 'api')),
  from_address  text,
  subject       text,
  storage_path  text,            -- Supabase Storage object path
  mime          text,
  body_text     text,            -- for pasted or emailed plain text

  status        text not null default 'received'
                check (status in ('received', 'parsing', 'parsed', 'failed', 'applied', 'discarded')),
  extracted     jsonb,
  agent_run_id  uuid references agent_runs(id) on delete set null,
  sales_order_id uuid references sales_orders(id) on delete set null,
  error         text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- The RFC 5322 Message-ID of the email a document came from. Mail providers
-- retry a webhook whenever it does not return 2xx, and customers forward the
-- same PO to two of your staff — without this, one order becomes three.
alter table inbound_documents add column message_id text;

-- Partial, so the many uploads with no message id do not collide with each
-- other on a null.
create unique index inbound_documents_message_id_idx
  on inbound_documents (org_id, message_id)
  where message_id is not null;

create index inbound_documents_org_status_idx on inbound_documents (org_id, status, created_at desc);

-- Learned mappings from a customer's own wording to a catalog product. Checked
-- before the model runs, so every human correction at review time makes the
-- next extraction cheaper and more accurate.
create table customer_product_aliases (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  raw_text    text not null,
  product_id  uuid not null references products(id) on delete cascade,
  package_type_id uuid references package_types(id),
  hit_count   integer not null default 0,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),

  unique (org_id, customer_id, raw_text)
);

create index customer_product_aliases_lookup_idx
  on customer_product_aliases (org_id, customer_id, lower(raw_text));

-- ── updated_at maintenance ──────────────────────────────────────────────────

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch before update on products
  for each row execute function touch_updated_at();
create trigger sales_orders_touch before update on sales_orders
  for each row execute function touch_updated_at();
create trigger purchase_orders_touch before update on purchase_orders
  for each row execute function touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table organizations           enable row level security;
alter table memberships             enable row level security;
alter table document_sequences      enable row level security;
alter table products                enable row level security;
alter table package_types           enable row level security;
alter table batches                 enable row level security;
alter table stock_moves             enable row level security;
alter table customers               enable row level security;
alter table suppliers               enable row level security;
alter table sales_orders            enable row level security;
alter table sales_order_lines       enable row level security;
alter table purchase_orders         enable row level security;
alter table purchase_order_lines    enable row level security;
alter table invoices                enable row level security;
alter table invoice_lines           enable row level security;
alter table agent_runs              enable row level security;
alter table agent_actions           enable row level security;
alter table autonomy_policies       enable row level security;
alter table inbound_documents       enable row level security;
alter table customer_product_aliases enable row level security;

-- organizations: members read; any authenticated user may create one (the
-- trigger above makes them its owner); owners/admins may rename it.
create policy org_select on organizations
  for select using (is_org_member(id));
create policy org_insert on organizations
  for insert with check (auth.uid() is not null);
create policy org_update on organizations
  for update using (has_org_role(id, array['owner', 'admin']));

-- memberships: you can always see your own row; members see the roster;
-- only owners and admins change it.
create policy membership_select on memberships
  for select using (user_id = auth.uid() or is_org_member(org_id));
create policy membership_write on memberships
  for all using (has_org_role(org_id, array['owner', 'admin']))
  with check (has_org_role(org_id, array['owner', 'admin']));

-- Everything else: uniform member access. Viewers are restricted in
-- application code (the action registry checks role), not here — keeping the
-- policies uniform is what makes them auditable at a glance.
do $$
declare
  t text;
begin
  foreach t in array array[
    'document_sequences', 'products', 'package_types', 'batches', 'stock_moves',
    'customers', 'suppliers', 'sales_orders', 'sales_order_lines',
    'purchase_orders', 'purchase_order_lines', 'invoices', 'invoice_lines',
    'agent_runs', 'agent_actions', 'autonomy_policies', 'inbound_documents',
    'customer_product_aliases'
  ]
  loop
    execute format(
      'create policy %I on %I for all using (is_org_member(org_id)) with check (is_org_member(org_id))',
      t || '_member_access', t
    );
  end loop;
end;
$$;

-- stock_moves is an audit log: no updates, no deletes, even for members.
-- To undo a move, post its inverse (see reverse_stock_move in functions.sql).
create policy stock_moves_append_only_update on stock_moves
  as restrictive for update using (false);
create policy stock_moves_append_only_delete on stock_moves
  as restrictive for delete using (false);
