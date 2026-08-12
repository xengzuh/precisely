-- ============================================================================
-- DESTRUCTIVE — drops every object schema.sql and functions.sql create.
--
-- Run this only when you want to rebuild the database from scratch. It exists
-- because schema.sql is not idempotent: re-running it over an existing schema
-- fails with 42P07 ("relation already exists"), and a half-applied run leaves
-- the database in a state neither file can recover from.
--
-- ALL DATA IS LOST. Safe while pre-launch; do not run against anything real.
--
-- Cleans both public and extensions. Earlier runs of schema.sql landed in
-- extensions, because the SQL editor's search_path is `"$user", public,
-- extensions` and Postgres silently skips entries that are missing or lack
-- USAGE — so a skipped public sends unqualified CREATEs to extensions.
--
-- Order: reset.sql → schema.sql → functions.sql → seed.sql
-- ============================================================================

do $$
declare
  tables_ours constant text[] := array[
    'organizations', 'memberships', 'document_sequences', 'products',
    'package_types', 'batches', 'stock_moves', 'customers', 'suppliers',
    'sales_orders', 'sales_order_lines', 'purchase_orders',
    'purchase_order_lines', 'invoices', 'invoice_lines', 'agent_runs',
    'agent_actions', 'autonomy_policies', 'inbound_documents',
    'customer_product_aliases'
  ];
  funcs_ours constant text[] := array[
    'is_org_member', 'has_org_role', 'handle_new_organization',
    'touch_updated_at', 'next_document_number', 'post_stock_move',
    'reverse_stock_move', 'recalc_sales_order_totals', 'create_sales_order',
    'allocate_sales_order', 'fulfil_sales_order', 'cancel_sales_order',
    'create_invoice_from_order', 'create_purchase_order',
    'receive_purchase_order'
  ];
  r record;
begin
  -- cascade takes each table's indexes, triggers, RLS policies, and the foreign
  -- keys pointing at it, so drop order does not matter.
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname in ('public', 'extensions')
      and tablename = any (tables_ours)
  loop
    execute format('drop table if exists %I.%I cascade', r.schemaname, r.tablename);
    raise notice 'dropped table %.%', r.schemaname, r.tablename;
  end loop;

  -- Functions belong to no table, so the cascade above does not reach them.
  -- Identity arguments are needed in case a name ended up overloaded.
  for r in
    select n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'extensions')
      and p.proname = any (funcs_ours)
  loop
    execute format('drop function if exists %I.%I(%s) cascade',
                   r.nspname, r.proname, r.args);
    raise notice 'dropped function %.%', r.nspname, r.proname;
  end loop;
end $$;

-- Confirm nothing of ours survives in either schema. Expect 0 / 0.
select
  (select count(*) from pg_tables
    where schemaname in ('public', 'extensions')
      and tablename in ('organizations', 'memberships', 'products', 'stock_moves',
                        'sales_orders', 'invoices', 'agent_actions')) as tables_left,
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'extensions')
      and p.proname in ('is_org_member', 'post_stock_move',
                        'create_sales_order')) as functions_left;
