"""
Trident Backtester — CLI entry point.

Usage:
    py packages/backtester/run.py [--seed 42] [--days 90]
"""

import argparse
import sys
import os

# Ensure package is importable
sys.path.insert(0, os.path.dirname(__file__))

from src.config import BACKTEST_CONFIG, PERP_MARKETS, SPREAD_PAIRS
from src.data.generator import generate_all
from src.strategies.spread import evaluate_pair
from src.strategies.funding import evaluate_market
from src.engine.simulator import Simulator
from src.analysis.report import compute_summary, print_summary, generate_charts


def main():
    parser = argparse.ArgumentParser(description="Trident Strategy Backtester")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    parser.add_argument("--days", type=int, default=90, help="Simulation days (default: 90)")
    parser.add_argument("--capital", type=float, default=10_000, help="Initial capital USDC (default: 10000)")
    parser.add_argument("--no-charts", action="store_true", help="Skip chart generation")
    args = parser.parse_args()

    # Override config
    BACKTEST_CONFIG["SIMULATION_DAYS"] = args.days
    BACKTEST_CONFIG["INITIAL_CAPITAL_USDC"] = args.capital

    print(f"\n  Generating {args.days} days of synthetic market data (seed={args.seed})...")
    data = generate_all(seed=args.seed)
    prices = data["prices"]
    funding = data["funding_rates"]
    spreads = data["spread_ratios"]
    print(f"  Generated {len(prices)} price ticks, {len(funding)} funding snapshots, {len(spreads)} spread snapshots")

    # Evaluate signals
    print("  Computing spread signals...")
    spread_signals = {}
    for pair in SPREAD_PAIRS:
        pair_name = f"{pair['symbolA']}/{pair['symbolB']}"
        spread_signals[pair_name] = evaluate_pair(spreads, pair_name)
        n_entries = len(spread_signals[pair_name][spread_signals[pair_name]["action"].isin(["enter_long", "enter_short"])])
        print(f"    {pair_name}: {n_entries} entry signals")

    print("  Computing funding signals...")
    funding_signals = {}
    for sym, idx in PERP_MARKETS.items():
        funding_signals[sym] = evaluate_market(funding, idx, sym)
        n_entries = len(funding_signals[sym][funding_signals[sym]["action"] == "enter_basis"])
        print(f"    {sym}: {n_entries} entry signals")

    # Run simulation
    print(f"\n  Running backtest simulation ({args.days} days, ${args.capital:,.0f} USDC)...")
    sim = Simulator(spread_signals, funding_signals, prices)
    result = sim.run()

    # Report
    summary = compute_summary(result)
    print_summary(summary)

    # Charts
    if not args.no_charts:
        output_dir = os.path.join(os.path.dirname(__file__), "output")
        generate_charts(result, output_dir)

    return summary


if __name__ == "__main__":
    main()
