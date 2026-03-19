"""
Funding monitor — mirrors FundingMonitorService.

Computes annualized funding APR and generates entry/exit
signals for basis trades.
"""

import numpy as np
import pandas as pd

from ..config import BOT_CONFIG


ENTRY_APR_PCT = BOT_CONFIG["FUNDING_ENTRY_THRESHOLD"] * 100  # 15%


def compute_funding_apr(funding_rate: float, oracle_price: float) -> float:
    """
    Annualize funding rate.
    Mirrors: (funding_rate / oracle_price) * 24 * 365 * 100
    Note: our tick interval is 5 min (not 1 hour), so we scale by
    the number of ticks per day instead of 24.
    """
    if oracle_price <= 0:
        return 0.0
    # funding_rate is already per-period. Annualize assuming 288 periods/day (5 min ticks)
    return (funding_rate / oracle_price) * 288 * 365 * 100


def resolve_action(current_apr: float, is_flip: bool) -> str:
    """
    Map funding state to signal action.
    Mirrors FundingMonitorService.resolveAction().
    """
    if is_flip and abs(current_apr) < ENTRY_APR_PCT:
        return "exit_basis"
    if abs(current_apr) >= ENTRY_APR_PCT and not is_flip:
        return "enter_basis"
    return "hold"


def evaluate_market(
    funding_df: pd.DataFrame, market_index: int, symbol: str
) -> pd.DataFrame:
    """
    Evaluate a single market's funding rate signals over the full dataset.
    """
    market_data = funding_df[funding_df["market_index"] == market_index].copy()
    market_data = market_data.sort_values("timestamp").reset_index(drop=True)

    # Compute APR for each tick
    market_data["apr"] = market_data.apply(
        lambda r: compute_funding_apr(r["funding_rate"], r["oracle_price"]),
        axis=1,
    )

    # Detect flips
    market_data["prev_apr"] = market_data["apr"].shift(1).fillna(0)
    market_data["is_flip"] = (
        (market_data["prev_apr"] != 0)
        & (np.sign(market_data["apr"]) != np.sign(market_data["prev_apr"]))
    )

    # Generate actions
    market_data["action"] = market_data.apply(
        lambda r: resolve_action(r["apr"], r["is_flip"]), axis=1
    )

    return market_data
