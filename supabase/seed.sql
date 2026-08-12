-- ============================================================================
-- Seed data — a small Malaysian chemical distributor.
--
-- Run after schema.sql and functions.sql.
--
-- BEFORE RUNNING: create your user in Supabase Dashboard → Authentication →
-- Users, then set the email below to match. Sign-up is invite-only.
-- ============================================================================

-- See the note in schema.sql: without this, unqualified names can resolve to
-- the extensions schema rather than public.
set search_path = public;

do $$
declare
  v_email text := 'zengxuheng@gmail.com';   -- ← change to your auth user's email

  v_user uuid;
  v_org  uuid;

  p_ipa    uuid; p_naoh   uuid; p_h2so4  uuid;
  p_sles   uuid; p_glyc   uuid; p_citric uuid;
  p_gloves uuid;

  b_ipa1 uuid; b_ipa2 uuid; b_naoh1 uuid; b_h2so41 uuid; b_sles1 uuid; b_glyc1 uuid;

  c_acme uuid; c_seri uuid; c_pjm uuid;
  s_brenn uuid; s_kl uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception
      'No auth user with email %. Create one in Dashboard → Authentication → Users, then edit v_email at the top of this file.',
      v_email;
  end if;

  -- ── Organization ─────────────────────────────────────────────────────────
  insert into organizations (name, currency, tax_rate, tax_label, country, locale, timezone)
  values ('Selangor Chemical Supply Sdn Bhd', 'MYR', 0.0600, 'SST', 'MY', 'en-MY', 'Asia/Kuala_Lumpur')
  returning id into v_org;

  insert into memberships (user_id, org_id, role)
  values (v_user, v_org, 'owner')
  on conflict (user_id, org_id) do update set role = 'owner';

  -- ── Products ─────────────────────────────────────────────────────────────
  -- Densities are approximate room-temperature values, used for kg <-> L
  -- conversion when a customer orders in different units than we stock in.

  insert into products (org_id, sku, name, description, grade, concentration_pct,
                        base_uom, density_kg_per_l, cost_price, list_price,
                        reorder_point, reorder_qty, is_batch_tracked, shelf_life_days)
  values
    (v_org, 'SOL-IPA-99', 'Isopropyl Alcohol 99%',
     'Anhydrous IPA for cleaning and degreasing.', 'Technical', 99.0,
     'L', 0.78600, 6.4000, 9.5000, 400, 1000, true, 1095),

    (v_org, 'ALK-NAOH-32', 'Caustic Soda Solution 32%',
     'Sodium hydroxide solution, membrane grade.', 'Technical', 32.0,
     'L', 1.34800, 2.1000, 3.4000, 800, 2000, true, 730),

    (v_org, 'ACD-H2SO4-98', 'Sulphuric Acid 98%',
     'Concentrated sulphuric acid. Corrosive.', 'Technical', 98.0,
     'L', 1.83000, 3.2000, 5.1000, 400, 1000, true, 1825),

    (v_org, 'SUR-SLES-70', 'Sodium Laureth Sulphate 70%',
     'SLES 70% paste for detergent formulation.', 'Cosmetic', 70.0,
     'kg', 1.05000, 7.8000, 11.2000, 500, 1000, true, 365),

    (v_org, 'HUM-GLYC-99', 'Glycerine 99.5% USP',
     'Refined vegetable glycerine, USP grade.', 'USP', 99.5,
     'kg', 1.26100, 5.6000, 8.9000, 300, 750, true, 1095),

    (v_org, 'ACD-CITR-ANH', 'Citric Acid Anhydrous',
     'Food-grade citric acid powder.', 'Food', 100.0,
     'kg', null, 4.1000, 6.7000, 250, 500, true, 1095),

    (v_org, 'PPE-GLV-NIT-L', 'Nitrile Gloves, Large',
     'Chemical-resistant nitrile gloves, box of 100.', null, null,
     'ea', null, 18.0000, 29.0000, 40, 100, false, null);

  select id into p_ipa    from products where org_id = v_org and sku = 'SOL-IPA-99';
  select id into p_naoh   from products where org_id = v_org and sku = 'ALK-NAOH-32';
  select id into p_h2so4  from products where org_id = v_org and sku = 'ACD-H2SO4-98';
  select id into p_sles   from products where org_id = v_org and sku = 'SUR-SLES-70';
  select id into p_glyc   from products where org_id = v_org and sku = 'HUM-GLYC-99';
  select id into p_citric from products where org_id = v_org and sku = 'ACD-CITR-ANH';
  select id into p_gloves from products where org_id = v_org and sku = 'PPE-GLV-NIT-L';

  -- ── Packaging ────────────────────────────────────────────────────────────
  -- This is what customers actually order in: "5 drums", not "1000 L".

  insert into package_types (org_id, product_id, name, qty_per_package, uom, tare_kg, is_default) values
    (v_org, p_ipa,    '200 L drum',   200, 'L', 18.0, true),
    (v_org, p_ipa,    '1000 L IBC',  1000, 'L', 65.0, false),
    (v_org, p_ipa,    '20 L jerrycan', 20, 'L',  1.2, false),

    (v_org, p_naoh,   '250 L drum',   250, 'L', 20.0, true),
    (v_org, p_naoh,   '1000 L IBC',  1000, 'L', 65.0, false),

    (v_org, p_h2so4,  '35 L carboy',   35, 'L',  4.5, true),
    (v_org, p_h2so4,  '250 L drum',   250, 'L', 22.0, false),

    (v_org, p_sles,   '200 kg drum',  200, 'kg', 18.0, true),
    (v_org, p_sles,   '25 kg pail',    25, 'kg',  1.8, false),

    (v_org, p_glyc,   '250 kg drum',  250, 'kg', 20.0, true),
    (v_org, p_glyc,   '25 kg jerrycan',25, 'kg',  1.5, false),

    (v_org, p_citric, '25 kg bag',     25, 'kg',  0.2, true),

    (v_org, p_gloves, 'Box of 100',     1, 'ea', null, true);

  -- ── Opening stock ────────────────────────────────────────────────────────
  -- Posted through post_stock_move so the ledger is complete from day one.
  -- The old system created opening stock out of nothing with no movement row.

  insert into batches (org_id, product_id, lot_code, mfg_date, expiry_date)
  values
    (v_org, p_ipa,   'IPA-2601-A', date '2026-01-14', date '2029-01-14'),
    (v_org, p_ipa,   'IPA-2603-B', date '2026-03-02', date '2029-03-02'),
    (v_org, p_naoh,  'NA-2602-C',  date '2026-02-20', date '2028-02-20'),
    (v_org, p_h2so4, 'SA-2512-D',  date '2025-12-05', date '2030-12-05'),
    (v_org, p_sles,  'SL-2604-E',  date '2026-04-11', date '2027-04-11'),
    (v_org, p_glyc,  'GL-2601-F',  date '2026-01-30', date '2029-01-30');

  select id into b_ipa1   from batches where product_id = p_ipa   and lot_code = 'IPA-2601-A';
  select id into b_ipa2   from batches where product_id = p_ipa   and lot_code = 'IPA-2603-B';
  select id into b_naoh1  from batches where product_id = p_naoh  and lot_code = 'NA-2602-C';
  select id into b_h2so41 from batches where product_id = p_h2so4 and lot_code = 'SA-2512-D';
  select id into b_sles1  from batches where product_id = p_sles  and lot_code = 'SL-2604-E';
  select id into b_glyc1  from batches where product_id = p_glyc  and lot_code = 'GL-2601-F';

  perform post_stock_move(p_org => v_org, p_product => p_ipa, p_direction => 'in',
    p_qty => 1200, p_reason => 'opening', p_batch => b_ipa1,
    p_unit_cost => 6.40, p_entered_qty => 6, p_entered_uom => '200 L drum');

  perform post_stock_move(p_org => v_org, p_product => p_ipa, p_direction => 'in',
    p_qty => 2000, p_reason => 'opening', p_batch => b_ipa2,
    p_unit_cost => 6.55, p_entered_qty => 2, p_entered_uom => '1000 L IBC');

  perform post_stock_move(p_org => v_org, p_product => p_naoh, p_direction => 'in',
    p_qty => 2500, p_reason => 'opening', p_batch => b_naoh1,
    p_unit_cost => 2.10, p_entered_qty => 10, p_entered_uom => '250 L drum');

  perform post_stock_move(p_org => v_org, p_product => p_h2so4, p_direction => 'in',
    p_qty => 350, p_reason => 'opening', p_batch => b_h2so41,
    p_unit_cost => 3.20, p_entered_qty => 10, p_entered_uom => '35 L carboy');

  perform post_stock_move(p_org => v_org, p_product => p_sles, p_direction => 'in',
    p_qty => 600, p_reason => 'opening', p_batch => b_sles1,
    p_unit_cost => 7.80, p_entered_qty => 3, p_entered_uom => '200 kg drum');

  perform post_stock_move(p_org => v_org, p_product => p_glyc, p_direction => 'in',
    p_qty => 250, p_reason => 'opening', p_batch => b_glyc1,
    p_unit_cost => 5.60, p_entered_qty => 1, p_entered_uom => '250 kg drum');

  -- Citric acid is batch tracked but has no opening stock: it sits below its
  -- reorder point, which gives the reorder agent something real to find.

  -- Gloves are not batch tracked, so no batch id.
  perform post_stock_move(p_org => v_org, p_product => p_gloves, p_direction => 'in',
    p_qty => 120, p_reason => 'opening',
    p_unit_cost => 18.00, p_entered_qty => 120, p_entered_uom => 'ea');

  -- ── Customers ────────────────────────────────────────────────────────────

  insert into customers (org_id, name, email, phone, billing_address, delivery_address,
                         tax_id, payment_terms_days, credit_limit)
  values
    (v_org, 'Acme Coatings Sdn Bhd', 'purchasing@acmecoatings.com.my', '+60 3-5566 1200',
     'Lot 14, Jalan Perusahaan 3, 40150 Shah Alam, Selangor',
     'Lot 14, Jalan Perusahaan 3, 40150 Shah Alam, Selangor',
     'C12345678900', 30, 150000),

    (v_org, 'Seri Murni Detergents', 'orders@serimurni.my', '+60 3-8899 4410',
     '22 Jalan Industri Puchong 5, 47100 Puchong, Selangor',
     '22 Jalan Industri Puchong 5, 47100 Puchong, Selangor',
     'C99887766554', 45, 80000),

    (v_org, 'PJ Metal Finishing', 'admin@pjmetalfinish.com', '+60 3-7722 3300',
     '8 Jalan 51A/225, 46100 Petaling Jaya, Selangor',
     '8 Jalan 51A/225, 46100 Petaling Jaya, Selangor',
     'C55443322110', 30, 60000);

  select id into c_acme from customers where org_id = v_org and name = 'Acme Coatings Sdn Bhd';
  select id into c_seri from customers where org_id = v_org and name = 'Seri Murni Detergents';
  select id into c_pjm  from customers where org_id = v_org and name = 'PJ Metal Finishing';

  -- ── Suppliers ────────────────────────────────────────────────────────────

  insert into suppliers (org_id, name, email, phone, billing_address, payment_terms_days)
  values
    (v_org, 'Brenntag Malaysia', 'sales.my@brenntag.example', '+60 3-3344 5000',
     'Jalan Sungai Pinang, 42000 Port Klang, Selangor', 30),
    (v_org, 'KL Solvent Traders', 'enquiry@klsolvent.example', '+60 3-6211 8080',
     '5 Jalan Kilang, 68100 Batu Caves, Selangor', 45);

  select id into s_brenn from suppliers where org_id = v_org and name = 'Brenntag Malaysia';
  select id into s_kl    from suppliers where org_id = v_org and name = 'KL Solvent Traders';

  -- ── Autonomy policy ──────────────────────────────────────────────────────
  -- Conservative defaults: agents may read and draft freely, but anything that
  -- moves stock, money, or leaves the building needs a human.

  insert into autonomy_policies (org_id, action, mode, threshold_amount) values
    (v_org, 'search_products',          'auto',    null),
    (v_org, 'get_customer',             'auto',    null),
    (v_org, 'upsert_customer',          'approve', null),
    (v_org, 'create_sales_order',       'auto',    5000),
    (v_org, 'update_sales_order_lines', 'auto',    5000),
    (v_org, 'confirm_sales_order',      'approve', null),
    (v_org, 'allocate_sales_order',     'approve', null),
    (v_org, 'fulfil_sales_order',       'approve', null),
    (v_org, 'cancel_sales_order',       'approve', null),
    (v_org, 'create_invoice',           'approve', null),
    (v_org, 'send_invoice',             'approve', null),
    (v_org, 'adjust_stock',             'approve', null),
    (v_org, 'create_purchase_order',    'auto',    10000),
    (v_org, 'receive_purchase_order',   'approve', null);

  raise notice 'Seeded org % for user %', v_org, v_email;
end;
$$;
