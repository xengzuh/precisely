CREATE TABLE suppliers (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text         NOT NULL,
  email      text,
  phone      text,
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE purchase_orders (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid          REFERENCES suppliers(id),
  product_id  uuid          REFERENCES products(id),
  quantity    integer       NOT NULL,
  unit_cost   numeric(10,2) NOT NULL,
  total_cost  numeric(10,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  status      text          NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'received', 'cancelled')),
  created_at  timestamptz   NOT NULL DEFAULT now()
);
