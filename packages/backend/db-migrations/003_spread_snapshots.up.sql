CREATE TABLE IF NOT EXISTS spread_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pair_name VARCHAR(32) NOT NULL,
    ratio NUMERIC(20, 10) NOT NULL,
    z_score NUMERIC(10, 4) NOT NULL,
    market_a_price NUMERIC(20, 6) NOT NULL,
    market_b_price NUMERIC(20, 6) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spread_pair_ts ON spread_snapshots (pair_name, timestamp DESC);
