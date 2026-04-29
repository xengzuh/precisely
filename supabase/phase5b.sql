-- Phase 5b: Row Level Security & Multi-tenancy
-- Run this entire file in Supabase Dashboard → SQL Editor.
-- Prerequisites: phase4.sql must already be applied.

-- ── Step 1: Add user_id to all tables ────────────────────────────────────────

ALTER TABLE products        ADD COLUMN user_id uuid REFERENCES auth.users(id);
ALTER TABLE transactions    ADD COLUMN user_id uuid REFERENCES auth.users(id);
ALTER TABLE suppliers       ADD COLUMN user_id uuid REFERENCES auth.users(id);
ALTER TABLE purchase_orders ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- ── Step 2: Enable RLS ───────────────────────────────────────────────────────

ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- ── Step 3: RLS Policies ─────────────────────────────────────────────────────

-- products
CREATE POLICY "Users can view own products"   ON products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON products FOR DELETE USING (auth.uid() = user_id);

-- transactions
CREATE POLICY "Users can view own transactions"   ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- suppliers
CREATE POLICY "Users can view own suppliers"   ON suppliers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own suppliers" ON suppliers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own suppliers" ON suppliers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own suppliers" ON suppliers FOR DELETE USING (auth.uid() = user_id);

-- purchase_orders
CREATE POLICY "Users can view own purchase orders"   ON purchase_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own purchase orders" ON purchase_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own purchase orders" ON purchase_orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own purchase orders" ON purchase_orders FOR DELETE USING (auth.uid() = user_id);

-- ── Step 4: Assign existing seed rows to your user ───────────────────────────
--
-- After running Steps 1–3, existing rows have user_id = NULL and will be
-- invisible to everyone once RLS is enabled. Assign them to your account:
--
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Copy the UUID in the "UID" column for your admin user (admin@myerp.com)
-- 3. Replace '<YOUR_USER_UUID>' below with that UUID and run these statements:

-- UPDATE products        SET user_id = '<YOUR_USER_UUID>' WHERE user_id IS NULL;
-- UPDATE transactions    SET user_id = '<YOUR_USER_UUID>' WHERE user_id IS NULL;
-- UPDATE suppliers       SET user_id = '<YOUR_USER_UUID>' WHERE user_id IS NULL;
-- UPDATE purchase_orders SET user_id = '<YOUR_USER_UUID>' WHERE user_id IS NULL;

-- ── Step 5: Verify RLS is working ────────────────────────────────────────────
--
-- Manual test procedure:
--
-- 1. Log in as your primary user (admin@myerp.com) — confirm all data is visible.
-- 2. Create a second test user in Supabase Dashboard → Authentication → Users.
-- 3. Log in as the second user in a separate browser / incognito window.
-- 4. Navigate to Inventory, Sales, Suppliers, and Purchase Orders.
--    Expected: all tables show zero rows (the second user owns no data).
-- 5. Log back in as admin@myerp.com — confirm all data is still visible.
--
-- If Step 4 still shows data, check that:
--   a) RLS is enabled on each table (Dashboard → Table Editor → [table] → RLS)
--   b) user_id was assigned in Step 4 (not NULL)
--   c) The anon key is being used, not the service-role key
