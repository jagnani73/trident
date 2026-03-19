-- Migration: Insert dummy data for Trident dashboard
-- Description: 48h of realistic vault activity — funding rates, spread snapshots,
--   positions, vault snapshots, and bot events. Data goes from T-48h to now.
-- Markets: SOL=0, BTC=1, ETH=2
-- Spread pairs: SOL/ETH, BTC/ETH

-- ════════════════════════════════════════════════════════════════
-- Helper: generate_series of timestamps every 30s for the last 48h
-- ════════════════════════════════════════════════════════════════

-- ── Funding Rate Snapshots (48h × 3 markets × every 30s = ~17,280 rows) ──
-- We insert every 5 minutes to keep it manageable (~1,728 rows)

INSERT INTO funding_rate_snapshots (market_index, funding_rate, oracle_price, mark_price, timestamp)
SELECT
    m.idx,
    -- Realistic funding rates: slightly positive with some noise
    CASE m.idx
        WHEN 0 THEN 0.000015 + (sin(extract(epoch FROM ts) / 3600) * 0.000008) + (random() * 0.000005 - 0.0000025)
        WHEN 1 THEN 0.000012 + (sin(extract(epoch FROM ts) / 4800) * 0.000010) + (random() * 0.000004 - 0.000002)
        WHEN 2 THEN 0.000018 + (cos(extract(epoch FROM ts) / 3000) * 0.000012) + (random() * 0.000006 - 0.000003)
    END,
    -- Oracle prices with realistic drift
    CASE m.idx
        WHEN 0 THEN 135.50 + (sin(extract(epoch FROM ts) / 7200) * 8) + (random() * 2 - 1)
        WHEN 1 THEN 67250.00 + (sin(extract(epoch FROM ts) / 10800) * 1500) + (random() * 200 - 100)
        WHEN 2 THEN 2485.00 + (cos(extract(epoch FROM ts) / 5400) * 80) + (random() * 20 - 10)
    END,
    -- Mark price: oracle + small deviation
    CASE m.idx
        WHEN 0 THEN 135.50 + (sin(extract(epoch FROM ts) / 7200) * 8) + (random() * 2 - 1) + (random() * 0.3 - 0.15)
        WHEN 1 THEN 67250.00 + (sin(extract(epoch FROM ts) / 10800) * 1500) + (random() * 200 - 100) + (random() * 30 - 15)
        WHEN 2 THEN 2485.00 + (cos(extract(epoch FROM ts) / 5400) * 80) + (random() * 20 - 10) + (random() * 2 - 1)
    END,
    ts
FROM generate_series(
    NOW() - INTERVAL '48 hours',
    NOW(),
    INTERVAL '5 minutes'
) AS ts
CROSS JOIN (VALUES (0), (1), (2)) AS m(idx);

-- ── Spread Snapshots (48h × 2 pairs × every 5 min = ~1,152 rows) ──

INSERT INTO spread_snapshots (pair_name, ratio, z_score, market_a_price, market_b_price, timestamp)
SELECT
    p.name,
    CASE p.name
        WHEN 'SOL/ETH' THEN 0.0545 + (sin(extract(epoch FROM ts) / 5400) * 0.003) + (random() * 0.001 - 0.0005)
        WHEN 'BTC/ETH' THEN 27.05 + (sin(extract(epoch FROM ts) / 7200) * 1.2) + (random() * 0.3 - 0.15)
    END,
    -- Z-scores: mostly between -1.5 and 1.5, occasional spikes to ±2.5
    CASE p.name
        WHEN 'SOL/ETH' THEN (sin(extract(epoch FROM ts) / 3600) * 1.8) + (random() * 0.6 - 0.3)
        WHEN 'BTC/ETH' THEN (cos(extract(epoch FROM ts) / 4200) * 1.5) + (random() * 0.5 - 0.25)
    END,
    CASE p.name
        WHEN 'SOL/ETH' THEN 135.50 + (sin(extract(epoch FROM ts) / 7200) * 8) + (random() * 2 - 1)
        WHEN 'BTC/ETH' THEN 67250.00 + (sin(extract(epoch FROM ts) / 10800) * 1500) + (random() * 200 - 100)
    END,
    -- Market B is always ETH for both pairs
    2485.00 + (cos(extract(epoch FROM ts) / 5400) * 80) + (random() * 20 - 10),
    ts
FROM generate_series(
    NOW() - INTERVAL '48 hours',
    NOW(),
    INTERVAL '5 minutes'
) AS ts
CROSS JOIN (VALUES ('SOL/ETH'), ('BTC/ETH')) AS p(name);

-- ── Vault Snapshots (48h × every 5 min = ~576 rows) ──
-- TVL grows from ~9,800 to ~10,200 with noise, allocations shift over time

INSERT INTO vault_snapshots (
    total_value_usdc, lending_allocation, spread_allocation, basis_allocation,
    idle_allocation, lp_share_price, apy_24h, apy_7d, drawdown_from_hwm, timestamp
)
SELECT
    -- TVL: gradual growth from ~9,800 to ~10,200
    9800 + (extract(epoch FROM (ts - (NOW() - INTERVAL '48 hours'))) / 172800.0) * 400
        + (sin(extract(epoch FROM ts) / 3600) * 50) + (random() * 20 - 10),
    -- Lending: 30-45%
    0.35 + (sin(extract(epoch FROM ts) / 7200) * 0.07) + (random() * 0.02 - 0.01),
    -- Spread: 20-35%
    0.25 + (cos(extract(epoch FROM ts) / 5400) * 0.06) + (random() * 0.02 - 0.01),
    -- Basis: 15-25%
    0.20 + (sin(extract(epoch FROM ts) / 4800) * 0.04) + (random() * 0.015 - 0.0075),
    -- Idle: remainder (roughly 5-15%)
    GREATEST(0.05, 1.0 - (
        (0.35 + sin(extract(epoch FROM ts) / 7200) * 0.07) +
        (0.25 + cos(extract(epoch FROM ts) / 5400) * 0.06) +
        (0.20 + sin(extract(epoch FROM ts) / 4800) * 0.04)
    ) + (random() * 0.02 - 0.01)),
    -- LP share price: starts at 1.0, slowly grows
    1.0 + (extract(epoch FROM (ts - (NOW() - INTERVAL '48 hours'))) / 172800.0) * 0.0015
        + (random() * 0.0001 - 0.00005),
    -- APY 24h: volatile, 8-18%
    10.5 + (sin(extract(epoch FROM ts) / 3600) * 3.5) + (random() * 2 - 1),
    -- APY 7d: smoother, 9-13%
    11.0 + (sin(extract(epoch FROM ts) / 14400) * 1.5) + (random() * 0.5 - 0.25),
    -- Drawdown: usually small, occasional spikes
    GREATEST(0, 0.005 + (sin(extract(epoch FROM ts) / 7200) * 0.008) + (random() * 0.003 - 0.0015)),
    ts
FROM generate_series(
    NOW() - INTERVAL '48 hours',
    NOW(),
    INTERVAL '5 minutes'
);

-- ── Positions (mix of open and closed) ──

-- 2 open spread positions
INSERT INTO positions (type, status, market_a_index, market_b_index, side_a, side_b, size_usdc,
    entry_price_a, entry_price_b, entry_z_score, opened_at)
VALUES
    ('spread', 'open', 0, 2, 'long', 'short', 480.000000,
     133.250000, 2510.400000, 2.1500, NOW() - INTERVAL '6 hours'),
    ('spread', 'open', 1, 2, 'short', 'long', 620.000000,
     67800.000000, 2470.200000, -2.0800, NOW() - INTERVAL '2 hours');

-- 1 open basis position
INSERT INTO positions (type, status, market_a_index, side_a, size_usdc,
    entry_price_a, entry_funding_rate, opened_at)
VALUES
    ('basis', 'open', 0, 'short', 350.000000,
     136.100000, 0.0000180000, NOW() - INTERVAL '10 hours');

-- 4 closed spread positions
INSERT INTO positions (type, status, market_a_index, market_b_index, side_a, side_b, size_usdc,
    entry_price_a, entry_price_b, exit_price_a, exit_price_b,
    entry_z_score, exit_z_score, realized_pnl, close_reason, opened_at, closed_at)
VALUES
    ('spread', 'closed', 0, 2, 'long', 'short', 500.000000,
     130.800000, 2520.600000, 134.200000, 2498.100000,
     2.3200, 0.4200, 18.450000, 'target_hit',
     NOW() - INTERVAL '42 hours', NOW() - INTERVAL '38 hours'),
    ('spread', 'closed', 1, 2, 'short', 'long', 550.000000,
     66900.000000, 2495.300000, 67400.000000, 2478.800000,
     -2.1800, -0.3500, -12.300000, 'stop_loss',
     NOW() - INTERVAL '36 hours', NOW() - INTERVAL '32 hours'),
    ('spread', 'closed', 0, 2, 'short', 'long', 420.000000,
     136.500000, 2460.200000, 134.100000, 2490.800000,
     -2.4500, -0.2800, 22.100000, 'target_hit',
     NOW() - INTERVAL '28 hours', NOW() - INTERVAL '22 hours'),
    ('spread', 'closed', 1, 2, 'long', 'short', 380.000000,
     67100.000000, 2505.400000, 67600.000000, 2480.100000,
     2.0500, 0.3800, 8.750000, 'max_age',
     NOW() - INTERVAL '26 hours', NOW() - INTERVAL '2 hours');

-- 2 closed basis positions
INSERT INTO positions (type, status, market_a_index, side_a, size_usdc,
    entry_price_a, exit_price_a, entry_funding_rate, realized_pnl, close_reason,
    opened_at, closed_at)
VALUES
    ('basis', 'closed', 2, 'short', 400.000000,
     2510.300000, 2488.700000, 0.0000220000, 14.200000, 'target_hit',
     NOW() - INTERVAL '40 hours', NOW() - INTERVAL '30 hours'),
    ('basis', 'closed', 0, 'short', 300.000000,
     132.400000, 135.800000, 0.0000160000, -6.800000, 'funding_flip',
     NOW() - INTERVAL '20 hours', NOW() - INTERVAL '14 hours');

-- ── Bot Events (sample audit log) ──

INSERT INTO bot_events (event_type, details, timestamp)
VALUES
    -- Tick events (sample every ~hour for the last 48h)
    ('tick', '{"source": "data-collector", "tick": 1, "fundingCount": 3, "spreadCount": 2, "durationMs": 45}',
     NOW() - INTERVAL '48 hours'),
    ('tick', '{"source": "bot-engine", "tick": 1, "proposals": 1, "executed": 0, "drawdownPct": 0.001, "durationMs": 210}',
     NOW() - INTERVAL '48 hours'),
    ('tick', '{"source": "data-collector", "tick": 100, "fundingCount": 3, "spreadCount": 2, "durationMs": 38}',
     NOW() - INTERVAL '42 hours'),
    ('tick', '{"source": "bot-engine", "tick": 100, "proposals": 2, "executed": 1, "drawdownPct": 0.003, "durationMs": 340}',
     NOW() - INTERVAL '42 hours'),
    ('open_position', '{"type": "spread", "marketA": 0, "marketB": 2, "sideA": "long", "sideB": "short", "sizeUsdc": 500}',
     NOW() - INTERVAL '42 hours'),
    ('tick', '{"source": "data-collector", "tick": 500, "fundingCount": 3, "spreadCount": 2, "durationMs": 42}',
     NOW() - INTERVAL '36 hours'),
    ('tick', '{"source": "bot-engine", "tick": 500, "proposals": 1, "executed": 1, "drawdownPct": 0.008, "durationMs": 280}',
     NOW() - INTERVAL '36 hours'),
    ('open_position', '{"type": "basis", "marketA": 2, "sideA": "short", "sizeUsdc": 400}',
     NOW() - INTERVAL '40 hours'),
    ('close_position', '{"positionId": "auto", "reason": "target_hit", "markets": [0, 2]}',
     NOW() - INTERVAL '38 hours'),
    ('tick', '{"source": "data-collector", "tick": 1000, "fundingCount": 3, "spreadCount": 2, "durationMs": 50}',
     NOW() - INTERVAL '28 hours'),
    ('tick', '{"source": "bot-engine", "tick": 1000, "proposals": 3, "executed": 2, "drawdownPct": 0.012, "durationMs": 520}',
     NOW() - INTERVAL '28 hours'),
    ('close_position', '{"positionId": "auto", "reason": "stop_loss", "markets": [1, 2]}',
     NOW() - INTERVAL '32 hours'),
    ('close_position', '{"positionId": "auto", "reason": "target_hit", "markets": [0, 2]}',
     NOW() - INTERVAL '22 hours'),
    ('error', '{"source": "bot-engine", "tick": 1200, "error": "DriftClient has no user for user id 0_3a3UWF...", "durationMs": 15}',
     NOW() - INTERVAL '18 hours'),
    ('tick', '{"source": "data-collector", "tick": 2000, "fundingCount": 3, "spreadCount": 2, "durationMs": 41}',
     NOW() - INTERVAL '12 hours'),
    ('tick', '{"source": "bot-engine", "tick": 2000, "proposals": 2, "executed": 1, "drawdownPct": 0.006, "durationMs": 290}',
     NOW() - INTERVAL '12 hours'),
    ('open_position', '{"type": "spread", "marketA": 0, "marketB": 2, "sideA": "long", "sideB": "short", "sizeUsdc": 480}',
     NOW() - INTERVAL '6 hours'),
    ('close_position', '{"positionId": "auto", "reason": "funding_flip", "markets": [0]}',
     NOW() - INTERVAL '14 hours'),
    ('tick', '{"source": "data-collector", "tick": 3000, "fundingCount": 3, "spreadCount": 2, "durationMs": 44}',
     NOW() - INTERVAL '4 hours'),
    ('tick', '{"source": "bot-engine", "tick": 3000, "proposals": 1, "executed": 1, "drawdownPct": 0.004, "durationMs": 310}',
     NOW() - INTERVAL '4 hours'),
    ('open_position', '{"type": "spread", "marketA": 1, "marketB": 2, "sideA": "short", "sideB": "long", "sizeUsdc": 620}',
     NOW() - INTERVAL '2 hours'),
    ('open_position', '{"type": "basis", "marketA": 0, "sideA": "short", "sizeUsdc": 350}',
     NOW() - INTERVAL '10 hours'),
    ('tick', '{"source": "data-collector", "tick": 3400, "fundingCount": 3, "spreadCount": 2, "durationMs": 39}',
     NOW() - INTERVAL '30 minutes'),
    ('tick', '{"source": "bot-engine", "tick": 3400, "proposals": 0, "executed": 0, "drawdownPct": 0.003, "durationMs": 180}',
     NOW() - INTERVAL '30 minutes');
