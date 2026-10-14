CREATE TABLE IF NOT EXISTS products (
  id integer PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  price_cents integer NOT NULL
);

INSERT INTO products (id, code, name, category, price_cents)
SELECT n,
       'P' || lpad(n::text, 6, '0'),
       'Product ' || n,
       CASE n % 5 WHEN 0 THEN 'books' WHEN 1 THEN 'home' WHEN 2 THEN 'electronics' WHEN 3 THEN 'outdoors' ELSE 'office' END,
       500 + (n % 50000)
FROM generate_series(1, 20000) AS n
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);

CREATE TABLE IF NOT EXISTS test_runs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  scenario text NOT NULL,
  virtual_users integer NOT NULL,
  duration_seconds integer NOT NULL,
  pool_size integer NOT NULL,
  summary jsonb NOT NULL,
  series jsonb NOT NULL
);
