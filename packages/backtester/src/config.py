"""
BOT_CONFIG mirror — must match packages/backend/utils/constants.ts exactly.
"""

BOT_CONFIG = {
    "TICK_INTERVAL_MS": 30_000,
    "SPREAD_ENTRY_Z_SCORE": 2.0,
    "SPREAD_EXIT_Z_SCORE": 0.5,
    "FUNDING_ENTRY_THRESHOLD": 0.15,  # 15% APR
    "MAX_DRAWDOWN_PCT": 0.05,
    "MAX_SPREAD_ALLOCATION": 0.40,
    "MAX_BASIS_ALLOCATION": 0.30,
    "MIN_LENDING_ALLOCATION": 0.30,
    "ZSCORE_LOOKBACK_COUNT": 2880,
    "FUNDING_LOOKBACK_COUNT": 2880,
    "MIN_ZSCORE_DATA_POINTS": 30,
    "POSITION_STOP_LOSS_PCT": 0.03,
    "MAX_SINGLE_MARKET_EXPOSURE_PCT": 0.50,
    "HEALTH_RATE_FLOOR": 1.20,
    "EMERGENCY_COOLDOWN_MS": 15 * 60_000,
    "MAX_POSITION_AGE_MS": 24 * 60 * 60_000,
    "MIN_POSITION_SIZE_USDC": 10,
    "CONFIDENCE_THRESHOLD": 0.50,
    "REBALANCE_DRIFT_PCT": 0.05,
}

SPREAD_PAIRS = [
    {"symbolA": "SOL", "symbolB": "ETH"},
    {"symbolA": "BTC", "symbolB": "ETH"},
]

PERP_MARKETS = {"SOL": 0, "BTC": 1, "ETH": 2}

# Backtest-specific settings
BACKTEST_CONFIG = {
    "INITIAL_CAPITAL_USDC": 10_000,
    "SIMULATION_DAYS": 90,
    "TICK_INTERVAL_SECONDS": 300,  # 5-min ticks for speed (vs 30s live)
    "LENDING_APY_BASE": 0.07,  # 7% base lending APY
    "SLIPPAGE_BPS": 5,  # 5 bps per leg
    "TX_COST_USDC": 0.001,  # per transaction
}
