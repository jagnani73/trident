"""
Performance analysis and chart generation.

Produces summary statistics and matplotlib charts for backtest results.
"""

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
import pandas as pd

from ..config import BACKTEST_CONFIG
from ..engine.simulator import BacktestResult


def compute_summary(result: BacktestResult) -> dict:
    """Compute summary statistics from backtest results."""
    initial = BACKTEST_CONFIG["INITIAL_CAPITAL_USDC"]
    history = result.portfolio_history

    if not history:
        return {"error": "No portfolio history recorded"}

    final_value = history[-1].total_value
    total_return = (final_value - initial) / initial
    days = BACKTEST_CONFIG["SIMULATION_DAYS"]
    annualized_apy = ((1 + total_return) ** (365 / days) - 1) if days > 0 else 0

    # Drawdown stats
    max_drawdown = max((s.drawdown_pct for s in history), default=0)

    # Position stats
    closed = result.closed_positions
    n_trades = len(closed)
    wins = [c for c in closed if c.realized_pnl > 0]
    losses = [c for c in closed if c.realized_pnl <= 0]
    win_rate = len(wins) / n_trades if n_trades > 0 else 0

    avg_win = np.mean([c.realized_pnl for c in wins]) if wins else 0
    avg_loss = np.mean([c.realized_pnl for c in losses]) if losses else 0
    profit_factor = abs(sum(c.realized_pnl for c in wins) / sum(c.realized_pnl for c in losses)) if losses and sum(c.realized_pnl for c in losses) != 0 else float("inf")

    # By strategy type
    spread_trades = [c for c in closed if c.position.type == "spread"]
    basis_trades = [c for c in closed if c.position.type == "basis"]

    spread_pnl = sum(c.realized_pnl for c in spread_trades)
    basis_pnl = sum(c.realized_pnl for c in basis_trades)

    # Close reasons
    reasons = {}
    for c in closed:
        reasons[c.close_reason] = reasons.get(c.close_reason, 0) + 1

    # Sharpe ratio (daily returns)
    daily_values = [s.total_value for s in history]
    if len(daily_values) > 1:
        daily_returns = np.diff(daily_values) / daily_values[:-1]
        sharpe = (
            np.mean(daily_returns) / np.std(daily_returns) * np.sqrt(365)
            if np.std(daily_returns) > 0
            else 0
        )
    else:
        sharpe = 0

    return {
        "initial_capital": initial,
        "final_value": round(final_value, 2),
        "total_return_pct": round(total_return * 100, 2),
        "annualized_apy_pct": round(annualized_apy * 100, 2),
        "max_drawdown_pct": round(max_drawdown * 100, 2),
        "sharpe_ratio": round(sharpe, 2),
        "total_trades": n_trades,
        "win_rate_pct": round(win_rate * 100, 1),
        "avg_win_usdc": round(avg_win, 2),
        "avg_loss_usdc": round(avg_loss, 2),
        "profit_factor": round(profit_factor, 2),
        "spread_trades": len(spread_trades),
        "spread_pnl_usdc": round(spread_pnl, 2),
        "basis_trades": len(basis_trades),
        "basis_pnl_usdc": round(basis_pnl, 2),
        "lending_income_usdc": round(result.lending_income, 2),
        "total_slippage_usdc": round(result.total_slippage, 2),
        "total_tx_costs_usdc": round(result.total_tx_costs, 2),
        "emergency_exits": result.emergency_exits,
        "close_reasons": reasons,
        "simulation_days": BACKTEST_CONFIG["SIMULATION_DAYS"],
    }


def print_summary(summary: dict):
    """Print formatted summary to console."""
    print("\n" + "=" * 60)
    print("  TRIDENT BACKTEST RESULTS")
    print("=" * 60)
    print(f"\n  Simulation:  {summary['simulation_days']} days")
    print(f"  Initial:     ${summary['initial_capital']:,.2f}")
    print(f"  Final:       ${summary['final_value']:,.2f}")
    print(f"  Return:      {summary['total_return_pct']:+.2f}%")
    print(f"  APY:         {summary['annualized_apy_pct']:.2f}%")
    print(f"  Max DD:      {summary['max_drawdown_pct']:.2f}%")
    print(f"  Sharpe:      {summary['sharpe_ratio']:.2f}")

    print(f"\n  --- Trades ---")
    print(f"  Total:       {summary['total_trades']}")
    print(f"  Win Rate:    {summary['win_rate_pct']:.1f}%")
    print(f"  Avg Win:     ${summary['avg_win_usdc']:+.2f}")
    print(f"  Avg Loss:    ${summary['avg_loss_usdc']:+.2f}")
    print(f"  Profit Fac:  {summary['profit_factor']:.2f}")

    print(f"\n  --- By Strategy ---")
    print(f"  Spread:      {summary['spread_trades']} trades, ${summary['spread_pnl_usdc']:+.2f}")
    print(f"  Basis:       {summary['basis_trades']} trades, ${summary['basis_pnl_usdc']:+.2f}")
    print(f"  Lending:     ${summary['lending_income_usdc']:+.2f}")

    print(f"\n  --- Costs ---")
    print(f"  Slippage:    ${summary['total_slippage_usdc']:.2f}")
    print(f"  TX Costs:    ${summary['total_tx_costs_usdc']:.2f}")
    print(f"  Emergencies: {summary['emergency_exits']}")

    if summary.get("close_reasons"):
        print(f"\n  --- Close Reasons ---")
        for reason, count in sorted(summary["close_reasons"].items()):
            print(f"  {reason:20s} {count}")

    print("\n" + "=" * 60)


def generate_charts(result: BacktestResult, output_dir: str = "output"):
    """Generate performance charts and save to output directory."""
    os.makedirs(output_dir, exist_ok=True)
    history = result.portfolio_history

    if not history:
        print("No history to chart.")
        return

    timestamps = [s.timestamp for s in history]
    values = [s.total_value for s in history]
    drawdowns = [s.drawdown_pct * 100 for s in history]
    lending = [s.lending_usdc for s in history]
    spread = [s.spread_usdc for s in history]
    basis = [s.basis_usdc for s in history]

    fig, axes = plt.subplots(3, 1, figsize=(14, 12), sharex=True)
    fig.suptitle("Trident Backtest — 90-Day Simulation", fontsize=16, fontweight="bold")

    # 1. Portfolio Value
    ax1 = axes[0]
    ax1.plot(timestamps, values, color="#2563eb", linewidth=1.5)
    ax1.axhline(
        BACKTEST_CONFIG["INITIAL_CAPITAL_USDC"],
        color="#94a3b8",
        linestyle="--",
        alpha=0.5,
        label="Initial Capital",
    )
    ax1.fill_between(
        timestamps,
        BACKTEST_CONFIG["INITIAL_CAPITAL_USDC"],
        values,
        alpha=0.1,
        color="#2563eb",
    )
    ax1.set_ylabel("Portfolio Value (USDC)")
    ax1.legend(loc="upper left")
    ax1.grid(True, alpha=0.3)

    # Mark emergency exits
    for cp in result.closed_positions:
        if cp.close_reason == "emergency_exit" and cp.closed_timestamp:
            ax1.axvline(cp.closed_timestamp, color="red", alpha=0.3, linestyle=":")

    # 2. Drawdown
    ax2 = axes[1]
    ax2.fill_between(timestamps, 0, drawdowns, color="#ef4444", alpha=0.4)
    ax2.axhline(5.0, color="#ef4444", linestyle="--", alpha=0.7, label="5% Emergency Threshold")
    ax2.set_ylabel("Drawdown (%)")
    ax2.legend(loc="upper left")
    ax2.grid(True, alpha=0.3)
    ax2.invert_yaxis()

    # 3. Allocation Breakdown
    ax3 = axes[2]
    ax3.stackplot(
        timestamps,
        lending,
        spread,
        basis,
        labels=["Lending", "Spread", "Basis"],
        colors=["#22c55e", "#3b82f6", "#f59e0b"],
        alpha=0.7,
    )
    ax3.set_ylabel("Allocation (USDC)")
    ax3.legend(loc="upper left")
    ax3.grid(True, alpha=0.3)
    ax3.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax3.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))

    plt.tight_layout()
    chart_path = os.path.join(output_dir, "backtest_results.png")
    plt.savefig(chart_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"\n  Chart saved to: {chart_path}")

    # 4. Trade PnL distribution
    if result.closed_positions:
        fig2, (ax4, ax5) = plt.subplots(1, 2, figsize=(14, 5))
        fig2.suptitle("Trade Analysis", fontsize=14, fontweight="bold")

        pnls = [c.realized_pnl for c in result.closed_positions]
        colors = ["#22c55e" if p > 0 else "#ef4444" for p in pnls]
        ax4.bar(range(len(pnls)), pnls, color=colors, alpha=0.7)
        ax4.axhline(0, color="black", linewidth=0.5)
        ax4.set_xlabel("Trade #")
        ax4.set_ylabel("PnL (USDC)")
        ax4.set_title("Per-Trade PnL")
        ax4.grid(True, alpha=0.3)

        # Cumulative PnL
        cum_pnl = np.cumsum(pnls)
        ax5.plot(range(len(cum_pnl)), cum_pnl, color="#2563eb", linewidth=1.5)
        ax5.fill_between(range(len(cum_pnl)), 0, cum_pnl, alpha=0.1, color="#2563eb")
        ax5.axhline(0, color="black", linewidth=0.5)
        ax5.set_xlabel("Trade #")
        ax5.set_ylabel("Cumulative PnL (USDC)")
        ax5.set_title("Cumulative Trade PnL")
        ax5.grid(True, alpha=0.3)

        plt.tight_layout()
        trades_path = os.path.join(output_dir, "trade_analysis.png")
        plt.savefig(trades_path, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"  Chart saved to: {trades_path}")
