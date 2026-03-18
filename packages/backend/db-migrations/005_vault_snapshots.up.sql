CREATE TABLE IF NOT EXISTS vault_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_value_usdc NUMERIC(20, 6) NOT NULL,
    lending_allocation NUMERIC(10, 6) NOT NULL DEFAULT 0,
    spread_allocation NUMERIC(10, 6) NOT NULL DEFAULT 0,
    basis_allocation NUMERIC(10, 6) NOT NULL DEFAULT 0,
    idle_allocation NUMERIC(10, 6) NOT NULL DEFAULT 0,
    lp_share_price NUMERIC(20, 10) NOT NULL DEFAULT 1.0,
    apy_24h NUMERIC(10, 4),
    apy_7d NUMERIC(10, 4),
    drawdown_from_hwm NUMERIC(10, 6) NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vault_snapshots_ts ON vault_snapshots (timestamp DESC);
