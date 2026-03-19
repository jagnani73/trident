"""
Capital allocator — mirrors CapitalAllocatorService.

Converts signals into position open/close decisions with sizing.
"""

from ..config import BOT_CONFIG, BACKTEST_CONFIG


def size_position(max_usdc: float, confidence: float) -> float:
    """
    Position sizing. Mirrors CapitalAllocatorService.sizePosition().
    """
    base = max_usdc * 0.5
    return min(base * confidence, max_usdc)


def compute_slippage(size_usdc: float) -> float:
    """Round-trip slippage cost in USDC (both legs)."""
    slippage_pct = BACKTEST_CONFIG["SLIPPAGE_BPS"] / 10_000
    return size_usdc * slippage_pct * 2  # entry + exit, 2 legs each


def compute_tx_cost() -> float:
    """Transaction cost for a trade (4 txns: 2 legs open + 2 legs close)."""
    return BACKTEST_CONFIG["TX_COST_USDC"] * 4
