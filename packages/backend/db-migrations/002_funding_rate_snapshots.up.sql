CREATE TABLE IF NOT EXISTS funding_rate_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_index INTEGER NOT NULL,
    funding_rate NUMERIC(20, 10) NOT NULL,
    oracle_price NUMERIC(20, 6) NOT NULL,
    mark_price NUMERIC(20, 6) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_funding_rate_market_ts ON funding_rate_snapshots (market_index, timestamp DESC);
