CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    restaurant_id VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id VARCHAR(100) NOT NULL,
    qty INT NOT NULL,
    price NUMERIC(12,2) NOT NULL
);

CREATE TABLE outbox (
    id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE processed_events (
    event_id VARCHAR(300) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
