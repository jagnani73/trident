"""
Synthetic market data generator for backtesting.

Generates 90 days of realistic price + funding data for SOL, BTC, ETH
with mean-reverting spread ratios and regime-switching funding rates.
"""

import numpy as np
import pandas as pd

from ..config import BACKTEST_CONFIG, PERP_MARKETS, SPREAD_PAIRS


def generate_prices(
    days: int = BACKTEST_CONFIG["SIMULATION_DAYS"],
    tick_seconds: int = BACKTEST_CONFIG["TICK_INTERVAL_SECONDS"],
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate correlated price series for SOL, BTC, ETH using
    geometric Brownian motion with correlation structure.
    """
    rng = np.random.default_rng(seed)

    ticks_per_day = 86400 // tick_seconds
    n_ticks = days * ticks_per_day
    dt = tick_seconds / 86400  # fraction of a day

    # Base prices
    base_prices = {"SOL": 135.0, "BTC": 67_000.0, "ETH": 2_500.0}

    # Daily volatilities (annualized / sqrt(365))
    annual_vol = {"SOL": 0.80, "BTC": 0.55, "ETH": 0.65}

    # Correlation matrix (SOL-ETH high, BTC-ETH high, SOL-BTC moderate)
    corr = np.array([
        [1.00, 0.70, 0.85],  # SOL
        [0.70, 1.00, 0.80],  # BTC
        [0.85, 0.80, 1.00],  # ETH
    ])

    # Cholesky decomposition for correlated random walks
    L = np.linalg.cholesky(corr)

    timestamps = pd.date_range(
        start="2025-12-01", periods=n_ticks, freq=f"{tick_seconds}s"
    )

    prices = {}
    symbols = ["SOL", "BTC", "ETH"]

    for i, sym in enumerate(symbols):
        daily_vol = annual_vol[sym] / np.sqrt(365)
        tick_vol = daily_vol * np.sqrt(dt)

        # Generate correlated noise
        z = rng.normal(size=(n_ticks,))
        correlated_z = np.zeros(n_ticks)
        # Build correlated increments tick by tick using precomputed noise
        raw_noise = rng.normal(size=(n_ticks, 3))
        correlated_noise = raw_noise @ L.T

        log_returns = (
            -0.5 * tick_vol**2 + tick_vol * correlated_noise[:, i]
        )

        # Add mean-reversion to a trend (slight upward drift)
        drift = 0.0001 * dt  # tiny positive drift
        log_returns += drift

        log_prices = np.log(base_prices[sym]) + np.cumsum(log_returns)
        prices[sym] = np.exp(log_prices)

    # Inject spread divergence events (mean-reverting shocks)
    prices = _inject_spread_events(prices, n_ticks, ticks_per_day, rng)

    df = pd.DataFrame({"timestamp": timestamps})
    for sym in symbols:
        df[f"{sym}_price"] = prices[sym]

    return df


def _inject_spread_events(
    prices: dict, n_ticks: int, ticks_per_day: int, rng: np.random.Generator
) -> dict:
    """
    Inject periodic spread divergence events that mean-revert,
    creating realistic z-score signals.
    """
    # ~2-3 events per week, each lasting 4-24 hours
    n_events = int(n_ticks / ticks_per_day * 0.35)  # ~0.35 events/day

    for _ in range(n_events):
        start = rng.integers(ticks_per_day, n_ticks - ticks_per_day)
        duration = rng.integers(ticks_per_day // 6, ticks_per_day)  # 4-24h
        magnitude = rng.uniform(0.02, 0.06)  # 2-6% divergence
        target_sym = rng.choice(["SOL", "BTC"])

        # Create divergence: target moves away, then reverts
        half = duration // 2
        diverge = np.linspace(0, magnitude, half)
        revert = np.linspace(magnitude, 0, duration - half)
        shock = np.concatenate([diverge, revert])

        # Add noise to the shock
        shock += rng.normal(0, magnitude * 0.1, len(shock))

        end = min(start + len(shock), n_ticks)
        shock = shock[: end - start]

        sign = rng.choice([-1, 1])
        prices[target_sym][start:end] *= 1 + sign * shock

    return prices


def generate_funding_rates(
    price_df: pd.DataFrame,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate funding rates with regime-switching behavior.

    Regimes:
    - Normal: low funding (±5% APR)
    - Elevated: high funding (15-30% APR) lasting 2-7 days
    - Negative: negative funding during sell-offs
    """
    rng = np.random.default_rng(seed + 1)
    n_ticks = len(price_df)

    records = []

    for sym, market_idx in PERP_MARKETS.items():
        prices = price_df[f"{sym}_price"].values

        # Generate funding rate regime
        funding_rates = np.zeros(n_ticks)
        regime = "normal"
        regime_countdown = 0

        for t in range(n_ticks):
            if regime_countdown <= 0:
                # Transition probabilities (per tick at 5-min resolution)
                if regime == "normal":
                    # ~1 elevated period per 10 days = 0.0003 per tick
                    if rng.random() < 0.0003:
                        regime = "elevated"
                        regime_countdown = rng.integers(
                            288 * 1, 288 * 4
                        )  # 1-4 days
                    elif rng.random() < 0.0001:
                        regime = "negative"
                        regime_countdown = rng.integers(288, 288 * 2)  # 1-2 days
                elif regime in ("elevated", "negative"):
                    regime = "normal"
                    regime_countdown = rng.integers(288 * 5, 288 * 15)  # 5-15 days normal between events

            regime_countdown -= 1

            # Base funding rate per period
            # APR = base_rate * 288 * 365 * 100 = base_rate * 10,512,000
            # So base_rate = target_APR_pct / 10,512,000
            scale = 10_512_000
            if regime == "normal":
                # Target: 3-8% APR
                base_rate = rng.normal(5.0 / scale, 2.0 / scale)
            elif regime == "elevated":
                # Target: 18-28% APR
                base_rate = rng.normal(22.0 / scale, 4.0 / scale)
            else:  # negative
                # Target: -8 to -18% APR
                base_rate = rng.normal(-12.0 / scale, 3.0 / scale)

            funding_rates[t] = base_rate * prices[t]

        for t in range(n_ticks):
            records.append(
                {
                    "timestamp": price_df["timestamp"].iloc[t],
                    "market_index": market_idx,
                    "symbol": sym,
                    "funding_rate": funding_rates[t],
                    "oracle_price": prices[t],
                }
            )

    return pd.DataFrame(records)


def generate_spread_ratios(price_df: pd.DataFrame) -> pd.DataFrame:
    """Compute spread ratios from price data."""
    records = []

    for pair in SPREAD_PAIRS:
        sym_a = pair["symbolA"]
        sym_b = pair["symbolB"]
        pair_name = f"{sym_a}/{sym_b}"

        prices_a = price_df[f"{sym_a}_price"].values
        prices_b = price_df[f"{sym_b}_price"].values
        ratios = prices_a / prices_b

        for t in range(len(price_df)):
            records.append(
                {
                    "timestamp": price_df["timestamp"].iloc[t],
                    "pair_name": pair_name,
                    "ratio": ratios[t],
                    "market_a_price": prices_a[t],
                    "market_b_price": prices_b[t],
                }
            )

    return pd.DataFrame(records)


def generate_all(seed: int = 42) -> dict[str, pd.DataFrame]:
    """Generate all synthetic data. Returns dict of DataFrames."""
    prices = generate_prices(seed=seed)
    funding = generate_funding_rates(prices, seed=seed)
    spreads = generate_spread_ratios(prices)

    return {
        "prices": prices,
        "funding_rates": funding,
        "spread_ratios": spreads,
    }
