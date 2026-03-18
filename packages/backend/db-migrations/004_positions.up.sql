CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type position_type NOT NULL,
    status position_status NOT NULL DEFAULT 'open',
    market_a_index INTEGER NOT NULL,
    market_b_index INTEGER,
    side_a VARCHAR(10) NOT NULL,
    side_b VARCHAR(10),
    size_usdc NUMERIC(20, 6) NOT NULL,
    entry_price_a NUMERIC(20, 6) NOT NULL,
    entry_price_b NUMERIC(20, 6),
    exit_price_a NUMERIC(20, 6),
    exit_price_b NUMERIC(20, 6),
    entry_z_score NUMERIC(10, 4),
    exit_z_score NUMERIC(10, 4),
    entry_funding_rate NUMERIC(20, 10),
    realized_pnl NUMERIC(20, 6),
    close_reason close_reason,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_positions_status ON positions (status);
CREATE INDEX idx_positions_type ON positions (type);

CREATE TRIGGER positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
