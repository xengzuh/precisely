CREATE TABLE products (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text         NOT NULL,
  sku          text         UNIQUE NOT NULL,
  stock        integer      NOT NULL DEFAULT 0,
  price        numeric(10,2) NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid         NOT NULL REFERENCES products(id),
  quantity     integer      NOT NULL,
  total_price  numeric(10,2) NOT NULL,
  type         text         NOT NULL CHECK (type IN ('sale', 'purchase')),
  created_at   timestamptz  NOT NULL DEFAULT now()
);
