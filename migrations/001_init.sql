-- QuickCart Delivery Service — Database Schema
-- PostgreSQL (database: deliverydb)

CREATE TABLE IF NOT EXISTS drivers (
    id         SERIAL PRIMARY KEY,
    name       TEXT    NOT NULL,
    phone      TEXT    NOT NULL,
    available  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS deliveries (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    TEXT         NOT NULL UNIQUE,
    driver_id   INTEGER      NOT NULL REFERENCES drivers(id),
    status      TEXT         NOT NULL DEFAULT 'ASSIGNED',
    address     TEXT         NOT NULL,
    assigned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_drivers_available   ON drivers(available) WHERE available = true;
