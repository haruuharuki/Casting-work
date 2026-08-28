CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('silicone','resin')),
  name TEXT NOT NULL,
  paid_price REAL DEFAULT 0,
  list_price REAL,
  package_grams REAL NOT NULL,
  ratio_a REAL NOT NULL,
  ratio_b REAL NOT NULL,
  ratio_method TEXT NOT NULL DEFAULT 'weight',
  density REAL,
  shrinkage REAL,
  shore TEXT,
  working_minutes REAL,
  cure_hours REAL,
  max_pour_mm REAL,
  image_key TEXT,
  image_url TEXT,
  notes_json TEXT,
  source_url TEXT,
  custom INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
