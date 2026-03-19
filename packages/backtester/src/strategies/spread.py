"""
Spread detector — mirrors SpreadDetectorService.

Computes z-scores from rolling spread ratios and generates
entry/exit signals for mean-reversion spread trades.
"""

import numpy as np
import pandas as pd

from ..config import BOT_CONFIG


def compute_z_scores(ratios: pd.Series) -> pd.Series:
    """
    Compute rolling z-scores over the lookback window.
    Mirrors packages/common/src/utils/math.ts (population stddev).
    """
    lookback = BOT_CONFIG["ZSCORE_LOOKBACK_COUNT"]
    min_points = BOT_CONFIG["MIN_ZSCORE_DATA_POINTS"]

    z_scores = pd.Series(np.nan, index=ratios.index)

    for i in range(min_points, len(ratios)):
        start = max(0, i - lookback)
        window = ratios.iloc[start : i + 1].values

        mean = np.mean(window)
        std = np.std(window)  # population std (ddof=0), matches our math.ts

        if std > 0:
            z_scores.iloc[i] = (ratios.iloc[i] - mean) / std

    return z_scores


def compute_confidence(index: int, lookback: int = BOT_CONFIG["ZSCORE_LOOKBACK_COUNT"]) -> float:
    """Confidence score: min(1.0, data_points / lookback)."""
    data_points = min(index + 1, lookback)
    return min(1.0, data_points / lookback)


def resolve_action(z: float | None) -> str:
    """
    Map z-score to signal action.
    Mirrors SpreadDetectorService.resolveAction().
    """
    if z is None or np.isnan(z):
        return "hold"
    if z >= BOT_CONFIG["SPREAD_ENTRY_Z_SCORE"]:
        return "enter_short"
    if z <= -BOT_CONFIG["SPREAD_ENTRY_Z_SCORE"]:
        return "enter_long"
    if abs(z) <= BOT_CONFIG["SPREAD_EXIT_Z_SCORE"]:
        return "exit"
    return "hold"


def evaluate_pair(spread_df: pd.DataFrame, pair_name: str) -> pd.DataFrame:
    """
    Evaluate a single spread pair over the full dataset.
    Returns DataFrame with z-scores, actions, and confidence.
    """
    pair_data = spread_df[spread_df["pair_name"] == pair_name].copy()
    pair_data = pair_data.sort_values("timestamp").reset_index(drop=True)

    pair_data["z_score"] = compute_z_scores(pair_data["ratio"])
    pair_data["action"] = pair_data["z_score"].apply(resolve_action)
    pair_data["confidence"] = [
        compute_confidence(i) for i in range(len(pair_data))
    ]

    return pair_data
