-- ============================================================================
-- Business operations that must be atomic.
--
-- Run after schema.sql.
--
-- Why these exist: the previous implementation did read-modify-write on
-- products.stock from application code with no transaction and no lock, so two
-- concurrent sales could both read the same stock level and oversell. Every
-- balance change now happens inside one of these functions, under a row lock.
--
-- These are SECURITY INVOKER (the default) on purpose: RLS still applies, so a
-- member of org A cannot move org B's stock even by calling the RPC directly.
-- ============================================================================

-- ── Document numbering ──────────────────────────────────────────────────────

create or replace function next_document_number(p_org uuid, p_kind text)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_value  bigint;
begin
  insert into document_sequences (org_id, kind, prefix, next_value)
  values (
    p_org,
    p_kind,
    case p_kind
      when 'sales_order'    then 'SO-'
      when 'purchase_order' then 'PO-'
      when 'invoice'        then 'INV-'
      else upper(left(p_kind, 3)) || '-'
    end,
    1
  )
  on conflict (org_id, kind) do nothing;

  -- FOR UPDATE serialises concurrent callers so two orders can never share a
  -- number (the unique index on (org_id, order_no) would otherwise reject one).
  select prefix, next_value into v_prefix, v_value
  from document_sequences
  where org_id = p_org and kind = p_kind
  for update;

  update document_sequences
  set next_value = next_value + 1
  where org_id = p_org and kind = p_kind;

  return v_prefix || to_char(now(), 'YYYY') || '-' || lpad(v_value::text, 5, '0');
end;
$$;

-- ── Stock ledger ────────────────────────────────────────────────────────────

create or replace function post_stock_move(
  p_org             uuid,
  p_product         uuid,
  p_direction       text,
  p_qty             numeric,
  p_reason          text,
  p_batch           uuid    default null,
  p_lot_code        text    default null,
  p_expiry          date    default null,
  p_unit_cost       numeric default null,
  p_entered_qty     numeric default null,
  p_entered_uom     text    default null,
  p_ref_type        text    default null,
  p_ref_id          uuid    default null,
  p_agent_action    uuid    default null,
  p_release_reserved boolean default false,
  p_reverses        uuid    default null
)
returns uuid
language plpgsql
as $$
declare
  v_product   products%rowtype;
  v_batch     batches%rowtype;
  v_available numeric;
  v_move_id   uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_product from products
  where id = p_product and org_id = p_org
  for update;

  if not found then
    raise exception 'Product not found in this organization';
  end if;

  if v_product.is_batch_tracked then
    if p_direction = 'in' then
      if p_batch is not null then
        select * into v_batch from batches where id = p_batch and org_id = p_org for update;
        if not found then
          raise exception 'Batch not found in this organization';
        end if;
      else
        if p_lot_code is null or btrim(p_lot_code) = '' then
          raise exception 'Product % is batch tracked — a lot code is required', v_product.sku;
        end if;

        insert into batches (org_id, product_id, lot_code, expiry_date, qty_on_hand)
        values (p_org, p_product, p_lot_code, p_expiry, 0)
        on conflict (product_id, lot_code) do nothing;

        select * into v_batch from batches
        where product_id = p_product and lot_code = p_lot_code
        for update;
      end if;

      update batches set qty_on_hand = qty_on_hand + p_qty where id = v_batch.id;

    else -- out
      if p_batch is null then
        raise exception 'Product % is batch tracked — a batch must be specified to issue stock', v_product.sku;
      end if;

      select * into v_batch from batches where id = p_batch and org_id = p_org for update;
      if not found then
        raise exception 'Batch not found in this organization';
      end if;

      -- Fulfilling a reservation consumes stock that was already set aside, so
      -- it only has to fit within on-hand. An ad-hoc issue must fit within
      -- what is not already promised to someone else.
      v_available := case
        when p_release_reserved then v_batch.qty_on_hand
        else v_batch.qty_on_hand - v_batch.qty_reserved
      end;

      if v_available < p_qty then
        raise exception 'Insufficient stock in lot % — % % available, % requested',
          v_batch.lot_code, v_available, v_product.base_uom, p_qty;
      end if;

      update batches
      set qty_on_hand  = qty_on_hand - p_qty,
          qty_reserved = case
            when p_release_reserved then greatest(qty_reserved - p_qty, 0)
            else qty_reserved
          end
      where id = v_batch.id;
    end if;

    p_batch := v_batch.id;

  else -- not batch tracked
    if p_direction = 'in' then
      update products set qty_on_hand = qty_on_hand + p_qty where id = p_product;
    else
      v_available := case
        when p_release_reserved then v_product.qty_on_hand
        else v_product.qty_on_hand - v_product.qty_reserved
      end;

      if v_available < p_qty then
        raise exception 'Insufficient stock for % — % % available, % requested',
          v_product.sku, v_available, v_product.base_uom, p_qty;
      end if;

      update products
      set qty_on_hand  = qty_on_hand - p_qty,
          qty_reserved = case
            when p_release_reserved then greatest(qty_reserved - p_qty, 0)
            else qty_reserved
          end
      where id = p_product;
    end if;
  end if;

  insert into stock_moves (
    org_id, product_id, batch_id, direction, qty,
    entered_qty, entered_uom, unit_cost, reason,
    ref_type, ref_id, reverses_id, agent_action_id, created_by
  )
  values (
    p_org, p_product, p_batch, p_direction, p_qty,
    p_entered_qty, p_entered_uom, p_unit_cost, p_reason,
    p_ref_type, p_ref_id, p_reverses, p_agent_action, auth.uid()
  )
  returning id into v_move_id;

  return v_move_id;
end;
$$;

-- Undo: post the inverse move rather than mutating the ledger. stock_moves has
-- restrictive policies blocking UPDATE and DELETE, so this is the only way back.
create or replace function reverse_stock_move(p_move uuid)
returns uuid
language plpgsql
as $$
declare
  v_move  stock_moves%rowtype;
  v_exists uuid;
begin
  select * into v_move from stock_moves where id = p_move;
  if not found then
    raise exception 'Stock move not found';
  end if;

  select id into v_exists from stock_moves where reverses_id = p_move;
  if v_exists is not null then
    raise exception 'Stock move has already been reversed';
  end if;

  return post_stock_move(
    p_org       => v_move.org_id,
    p_product   => v_move.product_id,
    p_direction => case v_move.direction when 'in' then 'out' else 'in' end,
    p_qty       => v_move.qty,
    p_reason    => 'reversal',
    p_batch     => v_move.batch_id,
    p_unit_cost => v_move.unit_cost,
    p_ref_type  => v_move.ref_type,
    p_ref_id    => v_move.ref_id,
    p_reverses  => v_move.id
  );
end;
$$;

-- ── Sales orders ────────────────────────────────────────────────────────────

create or replace function recalc_sales_order_totals(p_order uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal numeric(14,2);
  v_rate     numeric(6,4);
begin
  select coalesce(sum(line_total), 0) into v_subtotal
  from sales_order_lines where order_id = p_order;

  select o.tax_rate into v_rate
  from sales_orders so join organizations o on o.id = so.org_id
  where so.id = p_order;

  update sales_orders
  set subtotal = v_subtotal,
      tax      = round(v_subtotal * v_rate, 2),
      total    = v_subtotal + round(v_subtotal * v_rate, 2)
  where id = p_order;
end;
$$;

-- p_lines is a JSON array of:
--   { product_id, description_raw, qty, uom, package_type_id, package_count,
--     unit_price, match_confidence, needs_review, notes }
-- product_id may be null: an agent that could not confidently match a line
-- records what the document said and flags it for review rather than guessing.
create or replace function create_sales_order(
  p_org    uuid,
  p_header jsonb,
  p_lines  jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_order_no text;
  v_line     jsonb;
  v_no       integer := 0;
  v_qty      numeric;
  v_price    numeric;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A sales order needs at least one line';
  end if;

  v_order_no := next_document_number(p_org, 'sales_order');

  insert into sales_orders (
    org_id, customer_id, order_no, customer_ref, status, source,
    order_date, requested_date, currency, notes, needs_review, created_by
  )
  values (
    p_org,
    nullif(p_header->>'customer_id', '')::uuid,
    v_order_no,
    nullif(p_header->>'customer_ref', ''),
    coalesce(nullif(p_header->>'status', ''), 'draft'),
    coalesce(nullif(p_header->>'source', ''), 'manual'),
    coalesce((p_header->>'order_date')::date, current_date),
    (p_header->>'requested_date')::date,
    coalesce(nullif(p_header->>'currency', ''), 'MYR'),
    nullif(p_header->>'notes', ''),
    coalesce((p_header->>'needs_review')::boolean, false),
    auth.uid()
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_no    := v_no + 1;
    v_qty   := (v_line->>'qty')::numeric;
    v_price := coalesce((v_line->>'unit_price')::numeric, 0);

    if v_qty is null or v_qty <= 0 then
      raise exception 'Line % has an invalid quantity', v_no;
    end if;

    insert into sales_order_lines (
      org_id, order_id, line_no, product_id, description_raw,
      qty, uom, package_type_id, package_count,
      unit_price, line_total, match_confidence, needs_review, notes
    )
    values (
      p_org, v_order_id, v_no,
      nullif(v_line->>'product_id', '')::uuid,
      nullif(v_line->>'description_raw', ''),
      v_qty,
      coalesce(nullif(v_line->>'uom', ''), 'ea'),
      nullif(v_line->>'package_type_id', '')::uuid,
      (v_line->>'package_count')::numeric,
      v_price,
      round(v_qty * v_price, 2),
      (v_line->>'match_confidence')::numeric,
      coalesce((v_line->>'needs_review')::boolean, false),
      nullif(v_line->>'notes', '')
    );
  end loop;

  perform recalc_sales_order_totals(v_order_id);

  -- An order is only as trustworthy as its least certain line.
  update sales_orders so
  set needs_review = true
  where so.id = v_order_id
    and exists (
      select 1 from sales_order_lines l
      where l.order_id = v_order_id and (l.needs_review or l.product_id is null)
    );

  return v_order_id;
end;
$$;

-- FEFO: reserve from the lot that expires soonest. Chemicals have shelf lives
-- and customers reject short-dated material, so earliest-expiry-first is the
-- correct default rather than FIFO.
create or replace function allocate_sales_order(p_order uuid)
returns void
language plpgsql
as $$
declare
  v_org       uuid;
  v_status    text;
  v_line      record;
  v_batch     record;
  v_remaining numeric;
  v_take      numeric;
  v_available numeric;
begin
  select org_id, status into v_org, v_status from sales_orders where id = p_order;
  if not found then
    raise exception 'Sales order not found';
  end if;
  if v_status not in ('draft', 'confirmed') then
    raise exception 'Order cannot be allocated from status %', v_status;
  end if;

  -- Lines the agent could not match have no product to draw from. Fail loudly
  -- rather than let the join below drop them and report a clean allocation.
  if exists (
    select 1 from sales_order_lines
    where order_id = p_order and product_id is null
  ) then
    raise exception 'Order has unmatched lines — resolve them before allocating';
  end if;

  for v_line in
    select l.*, p.is_batch_tracked, p.sku
    from sales_order_lines l
    join products p on p.id = l.product_id
    where l.order_id = p_order
    order by l.line_no
  loop
    v_remaining := v_line.qty - v_line.qty_allocated;
    continue when v_remaining <= 0;

    if v_line.is_batch_tracked then
      for v_batch in
        select * from batches
        where product_id = v_line.product_id
          and qty_on_hand > qty_reserved
        order by expiry_date nulls last, created_at
        for update
      loop
        exit when v_remaining <= 0;

        v_available := v_batch.qty_on_hand - v_batch.qty_reserved;
        v_take := least(v_available, v_remaining);

        update batches set qty_reserved = qty_reserved + v_take where id = v_batch.id;

        -- One batch per line keeps the model simple. A line needing stock from
        -- several lots is split by the caller before allocation.
        update sales_order_lines
        set qty_allocated = qty_allocated + v_take,
            batch_id      = coalesce(batch_id, v_batch.id)
        where id = v_line.id;

        v_remaining := v_remaining - v_take;
      end loop;

      if v_remaining > 0 then
        raise exception 'Insufficient stock to allocate % of % (short by %)',
          v_line.qty, v_line.sku, v_remaining;
      end if;

    else
      select (qty_on_hand - qty_reserved) into v_available
      from products where id = v_line.product_id for update;

      if v_available < v_remaining then
        raise exception 'Insufficient stock to allocate % of % (short by %)',
          v_line.qty, v_line.sku, v_remaining - v_available;
      end if;

      update products set qty_reserved = qty_reserved + v_remaining
      where id = v_line.product_id;

      update sales_order_lines set qty_allocated = qty
      where id = v_line.id;
    end if;
  end loop;

  update sales_orders set status = 'allocated' where id = p_order;
end;
$$;

-- Ship what was allocated: consume the reservation and write the ledger rows.
create or replace function fulfil_sales_order(p_order uuid)
returns void
language plpgsql
as $$
declare
  v_org  uuid;
  v_status text;
  v_line record;
begin
  select org_id, status into v_org, v_status from sales_orders where id = p_order;
  if not found then
    raise exception 'Sales order not found';
  end if;
  if v_status <> 'allocated' then
    raise exception 'Only an allocated order can be fulfilled (status is %)', v_status;
  end if;

  for v_line in
    select * from sales_order_lines where order_id = p_order order by line_no
  loop
    perform post_stock_move(
      p_org              => v_org,
      p_product          => v_line.product_id,
      p_direction        => 'out',
      p_qty              => v_line.qty_allocated,
      p_reason           => 'sale',
      p_batch            => v_line.batch_id,
      p_unit_cost        => v_line.unit_price,
      p_ref_type         => 'sales_order',
      p_ref_id           => p_order,
      p_release_reserved => true
    );
  end loop;

  update sales_orders set status = 'fulfilled' where id = p_order;
end;
$$;

create or replace function cancel_sales_order(p_order uuid)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_line   record;
begin
  select status into v_status from sales_orders where id = p_order;
  if not found then
    raise exception 'Sales order not found';
  end if;
  if v_status in ('fulfilled', 'invoiced', 'cancelled') then
    raise exception 'Cannot cancel an order in status %', v_status;
  end if;

  -- Release anything this order was holding so it becomes sellable again.
  for v_line in
    select l.*, p.is_batch_tracked
    from sales_order_lines l join products p on p.id = l.product_id
    where l.order_id = p_order and l.qty_allocated > 0
  loop
    if v_line.is_batch_tracked and v_line.batch_id is not null then
      update batches
      set qty_reserved = greatest(qty_reserved - v_line.qty_allocated, 0)
      where id = v_line.batch_id;
    else
      update products
      set qty_reserved = greatest(qty_reserved - v_line.qty_allocated, 0)
      where id = v_line.product_id;
    end if;

    update sales_order_lines set qty_allocated = 0, batch_id = null where id = v_line.id;
  end loop;

  update sales_orders set status = 'cancelled' where id = p_order;
end;
$$;

-- ── Invoices ────────────────────────────────────────────────────────────────

create or replace function create_invoice_from_order(p_order uuid)
returns uuid
language plpgsql
as $$
declare
  v_order      sales_orders%rowtype;
  v_invoice_id uuid;
  v_terms      integer;
begin
  select * into v_order from sales_orders where id = p_order;
  if not found then
    raise exception 'Sales order not found';
  end if;
  if v_order.status not in ('fulfilled', 'allocated') then
    raise exception 'Order must be allocated or fulfilled before invoicing (status is %)', v_order.status;
  end if;
  if exists (select 1 from invoices where order_id = p_order and status <> 'void') then
    raise exception 'Order has already been invoiced';
  end if;

  select coalesce(payment_terms_days, 30) into v_terms
  from customers where id = v_order.customer_id;

  insert into invoices (
    org_id, order_id, customer_id, invoice_no, status,
    issue_date, due_date, currency, subtotal, tax, total, created_by
  )
  values (
    v_order.org_id, p_order, v_order.customer_id,
    next_document_number(v_order.org_id, 'invoice'), 'draft',
    current_date, current_date + coalesce(v_terms, 30),
    v_order.currency, v_order.subtotal, v_order.tax, v_order.total,
    auth.uid()
  )
  returning id into v_invoice_id;

  insert into invoice_lines (
    org_id, invoice_id, line_no, product_id, description, qty, uom, unit_price, line_total
  )
  select
    l.org_id, v_invoice_id, l.line_no, l.product_id,
    coalesce(p.name, l.description_raw, 'Item'),
    l.qty, l.uom, l.unit_price, l.line_total
  from sales_order_lines l
  left join products p on p.id = l.product_id
  where l.order_id = p_order
  order by l.line_no;

  update sales_orders set status = 'invoiced' where id = p_order;

  return v_invoice_id;
end;
$$;

-- ── Purchase orders ─────────────────────────────────────────────────────────

create or replace function create_purchase_order(
  p_org    uuid,
  p_header jsonb,
  p_lines  jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_line     jsonb;
  v_no       integer := 0;
  v_qty      numeric;
  v_cost     numeric;
  v_subtotal numeric(14,2) := 0;
  v_rate     numeric(6,4);
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A purchase order needs at least one line';
  end if;

  insert into purchase_orders (
    org_id, supplier_id, order_no, status, source,
    order_date, expected_date, currency, notes, created_by
  )
  values (
    p_org,
    nullif(p_header->>'supplier_id', '')::uuid,
    next_document_number(p_org, 'purchase_order'),
    coalesce(nullif(p_header->>'status', ''), 'draft'),
    coalesce(nullif(p_header->>'source', ''), 'manual'),
    coalesce((p_header->>'order_date')::date, current_date),
    (p_header->>'expected_date')::date,
    coalesce(nullif(p_header->>'currency', ''), 'MYR'),
    nullif(p_header->>'notes', ''),
    auth.uid()
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_no   := v_no + 1;
    v_qty  := (v_line->>'qty')::numeric;
    v_cost := coalesce((v_line->>'unit_cost')::numeric, 0);

    if v_qty is null or v_qty <= 0 then
      raise exception 'Line % has an invalid quantity', v_no;
    end if;

    insert into purchase_order_lines (
      org_id, order_id, line_no, product_id, qty, uom,
      package_type_id, unit_cost, line_total, lot_code, expiry_date
    )
    values (
      p_org, v_order_id, v_no,
      (v_line->>'product_id')::uuid,
      v_qty,
      coalesce(nullif(v_line->>'uom', ''), 'ea'),
      nullif(v_line->>'package_type_id', '')::uuid,
      v_cost,
      round(v_qty * v_cost, 2),
      nullif(v_line->>'lot_code', ''),
      (v_line->>'expiry_date')::date
    );

    v_subtotal := v_subtotal + round(v_qty * v_cost, 2);
  end loop;

  select tax_rate into v_rate from organizations where id = p_org;

  update purchase_orders
  set subtotal = v_subtotal,
      tax      = round(v_subtotal * v_rate, 2),
      total    = v_subtotal + round(v_subtotal * v_rate, 2)
  where id = v_order_id;

  return v_order_id;
end;
$$;

-- Replaces the old markReceived(), which updated the order, then read the
-- product, then wrote the new stock level, then inserted a transaction — four
-- separate statements with no transaction around them.
create or replace function receive_purchase_order(p_order uuid)
returns void
language plpgsql
as $$
declare
  v_org    uuid;
  v_status text;
  v_line   record;
  v_qty    numeric;
begin
  select org_id, status into v_org, v_status from purchase_orders where id = p_order;
  if not found then
    raise exception 'Purchase order not found';
  end if;
  if v_status in ('received', 'cancelled') then
    raise exception 'Purchase order is already %', v_status;
  end if;

  for v_line in
    select l.*, p.is_batch_tracked, p.shelf_life_days
    from purchase_order_lines l
    join products p on p.id = l.product_id
    where l.order_id = p_order
    order by l.line_no
  loop
    v_qty := v_line.qty - v_line.qty_received;
    continue when v_qty <= 0;

    perform post_stock_move(
      p_org         => v_org,
      p_product     => v_line.product_id,
      p_direction   => 'in',
      p_qty         => v_qty,
      p_reason      => 'purchase',
      p_lot_code    => coalesce(
                         v_line.lot_code,
                         case when v_line.is_batch_tracked
                              then 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || v_line.line_no
                         end),
      p_expiry      => coalesce(
                         v_line.expiry_date,
                         case when v_line.shelf_life_days is not null
                              then current_date + v_line.shelf_life_days
                         end),
      p_unit_cost   => v_line.unit_cost,
      p_ref_type    => 'purchase_order',
      p_ref_id      => p_order
    );

    update purchase_order_lines set qty_received = qty where id = v_line.id;

    -- Keep cost price current so margin reporting reflects what was actually
    -- paid, not what someone typed when the product was created.
    update products set cost_price = v_line.unit_cost where id = v_line.product_id;
  end loop;

  update purchase_orders set status = 'received' where id = p_order;
end;
$$;
