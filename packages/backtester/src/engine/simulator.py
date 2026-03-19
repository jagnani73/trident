"""
Backtest simulation engine — mirrors the JobsService tick loop.

Runs the full signal → risk → allocate → execute pipeline over
synthetic data, tracking positions, PnL, and portfolio state.
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..config import BACKTEST_CONFIG, BOT_CONFIG, PERP_MARKETS, SPREAD_PAIRS
from ..strategies.allocator import compute_slippage, compute_tx_cost, size_position
from ..strategies.funding import evaluate_market
from ..strategies.spread import evaluate_pair


@dataclass
class Position:
    id: int
    type: str  # "spread" or "basis"
    pair_or_market: str
    side_a: str  # "long" or "short"
    side_b: str | None  # "long" or "short" for spread, None for basis
    size_usdc: float
    entry_price_a: float
    entry_price_b: float | None
    entry_z_score: float | None
    entry_funding_apr: float | None
    opened_at: int  # tick index
    opened_timestamp: pd.Timestamp | None = None


@dataclass
class ClosedPosition:
    position: Position
    exit_price_a: float
    exit_price_b: float | None
    exit_z_score: float | None
    realized_pnl: float
    close_reason: str
    closed_at: int
    closed_timestamp: pd.Timestamp | None = None


@dataclass
class PortfolioState:
    total_value: float
    lending_usdc: float
    spread_usdc: float
    basis_usdc: float
    idle_usdc: float
    hwm: float
    drawdown_pct: float
    timestamp: pd.Timestamp | None = None


@dataclass
class BacktestResult:
    portfolio_history: list[PortfolioState] = field(default_factory=list)
    closed_positions: list[ClosedPosition] = field(default_factory=list)
    open_positions: list[Position] = field(default_factory=list)
    total_trades: int = 0
    total_pnl: float = 0.0
    total_slippage: float = 0.0
    total_tx_costs: float = 0.0
    lending_income: float = 0.0
    emergency_exits: int = 0


class Simulator:
    def __init__(self, spread_signals: dict, funding_signals: dict, price_df: pd.DataFrame):
        """
        Args:
            spread_signals: {pair_name: DataFrame with z_score, action, confidence}
            funding_signals: {symbol: DataFrame with apr, action, is_flip}
            price_df: DataFrame with timestamps and price columns
        """
        self.spread_signals = spread_signals
        self.funding_signals = funding_signals
        self.price_df = price_df
        self.n_ticks = len(price_df)

        self.capital = BACKTEST_CONFIG["INITIAL_CAPITAL_USDC"]
        self.hwm = self.capital
        self.open_positions: list[Position] = []
        self.result = BacktestResult()
        self.next_position_id = 1
        self.cooldown_until = -1
        self.tick_seconds = BACKTEST_CONFIG["TICK_INTERVAL_SECONDS"]

    def run(self) -> BacktestResult:
        """Run the full backtest simulation."""
        for t in range(self.n_ticks):
            self._tick(t)

        # Close any remaining open positions at final prices
        for pos in list(self.open_positions):
            self._close_position(pos, t, "backtest_end")

        self.result.open_positions = self.open_positions
        return self.result

    def _tick(self, t: int):
        """Single tick — mirrors JobsService.botTick()."""
        timestamp = self.price_df["timestamp"].iloc[t]

        # 1. Compute current portfolio value
        portfolio_value = self._compute_portfolio_value(t)
        self.hwm = max(self.hwm, portfolio_value)
        drawdown = (self.hwm - portfolio_value) / self.hwm if self.hwm > 0 else 0

        # 2. Lending income (accrued per tick)
        lending_alloc = self._get_lending_usdc(t)
        lending_income_per_tick = (
            lending_alloc
            * BACKTEST_CONFIG["LENDING_APY_BASE"]
            / (365 * 86400 / self.tick_seconds)
        )
        self.capital += lending_income_per_tick
        self.result.lending_income += lending_income_per_tick

        # 3. Emergency check
        if drawdown > BOT_CONFIG["MAX_DRAWDOWN_PCT"] and self.open_positions:
            self._emergency_exit(t)
            self._record_state(t, timestamp)
            return

        # 4. Check position limits (stop-loss, max age)
        self._check_position_limits(t)

        # 5. If in cooldown, skip new entries
        if t < self.cooldown_until:
            self._record_state(t, timestamp)
            return

        # 6. Evaluate spread signals
        self._evaluate_spread_signals(t)

        # 7. Evaluate funding signals
        self._evaluate_funding_signals(t)

        # 8. Record portfolio state
        self._record_state(t, timestamp)

    def _compute_portfolio_value(self, t: int) -> float:
        """Total value = capital + unrealized PnL of open positions."""
        total = self.capital
        for pos in self.open_positions:
            total += self._unrealized_pnl(pos, t)
        return total

    def _get_lending_usdc(self, t: int) -> float:
        """Estimate lending allocation = capital - position sizes."""
        position_usdc = sum(p.size_usdc for p in self.open_positions)
        idle_and_lending = max(0, self.capital - position_usdc)
        return idle_and_lending

    def _unrealized_pnl(self, pos: Position, t: int) -> float:
        """Compute unrealized PnL for a position at tick t."""
        if pos.type == "spread":
            return self._spread_pnl(pos, t)
        else:
            return self._basis_pnl(pos, t)

    def _spread_pnl(self, pos: Position, t: int) -> float:
        """
        Spread PnL: profit from ratio convergence.
        Long A / Short B or Short A / Long B.
        """
        pair = pos.pair_or_market
        sym_a, sym_b = pair.split("/")

        cur_price_a = self.price_df[f"{sym_a}_price"].iloc[t]
        cur_price_b = self.price_df[f"{sym_b}_price"].iloc[t]

        # Leg A PnL
        size_per_leg = pos.size_usdc / 2
        qty_a = size_per_leg / pos.entry_price_a
        pnl_a = qty_a * (cur_price_a - pos.entry_price_a)
        if pos.side_a == "short":
            pnl_a = -pnl_a

        # Leg B PnL
        qty_b = size_per_leg / pos.entry_price_b
        pnl_b = qty_b * (cur_price_b - pos.entry_price_b)
        if pos.side_b == "short":
            pnl_b = -pnl_b

        return pnl_a + pnl_b

    def _basis_pnl(self, pos: Position, t: int) -> float:
        """
        Basis PnL: delta-neutral, profit from funding capture.
        Simplified: PnL = accumulated funding since entry.
        Mark-to-market is near zero for delta-neutral positions.
        """
        sym = pos.pair_or_market
        if sym not in self.funding_signals:
            return 0.0

        funding_data = self.funding_signals[sym]
        entry_tick = pos.opened_at
        if entry_tick >= len(funding_data) or t >= len(funding_data):
            return 0.0

        # Use vectorized sum for performance
        slice_data = funding_data.iloc[entry_tick : t + 1]
        rates = slice_data["funding_rate"].values
        prices = slice_data["oracle_price"].values

        # rate_pct per tick = funding_rate / oracle_price
        valid = prices > 0
        rate_pcts = np.where(valid, rates / prices, 0.0)

        # If short perp and funding is positive → we earn
        # If long perp and funding is negative → we earn
        total_rate = np.sum(rate_pcts)
        if pos.side_a == "short":
            return total_rate * pos.size_usdc
        else:
            return -total_rate * pos.size_usdc

    def _emergency_exit(self, t: int):
        """Close all positions — mirrors emergency exit logic."""
        for pos in list(self.open_positions):
            self._close_position(pos, t, "emergency_exit")

        cooldown_ticks = BOT_CONFIG["EMERGENCY_COOLDOWN_MS"] // (self.tick_seconds * 1000)
        self.cooldown_until = t + cooldown_ticks
        self.result.emergency_exits += 1

    def _check_position_limits(self, t: int):
        """Check stop-loss and max age for all open positions."""
        ticks_per_day = 86400 // self.tick_seconds
        max_age_ticks = int(BOT_CONFIG["MAX_POSITION_AGE_MS"] / (self.tick_seconds * 1000))

        for pos in list(self.open_positions):
            pnl = self._unrealized_pnl(pos, t)
            loss_pct = -pnl / pos.size_usdc if pos.size_usdc > 0 else 0

            if loss_pct > BOT_CONFIG["POSITION_STOP_LOSS_PCT"]:
                self._close_position(pos, t, "stop_loss")
                continue

            age_ticks = t - pos.opened_at
            if age_ticks > max_age_ticks:
                self._close_position(pos, t, "max_age")

    def _evaluate_spread_signals(self, t: int):
        """Check spread signals and open/close positions."""
        for pair_info in SPREAD_PAIRS:
            pair_name = f"{pair_info['symbolA']}/{pair_info['symbolB']}"
            if pair_name not in self.spread_signals:
                continue

            signals = self.spread_signals[pair_name]
            if t >= len(signals):
                continue

            row = signals.iloc[t]
            action = row["action"]
            z = row["z_score"]
            confidence = row["confidence"]

            existing = self._find_open_position("spread", pair_name)

            if action == "exit" and existing:
                self._close_position(existing, t, "target_hit")
                continue

            if action in ("enter_long", "enter_short"):
                if existing:
                    continue
                if confidence < BOT_CONFIG["CONFIDENCE_THRESHOLD"]:
                    continue

                # Compute available allocation
                spread_usdc = sum(
                    p.size_usdc for p in self.open_positions if p.type == "spread"
                )
                max_new = max(
                    0,
                    self._compute_portfolio_value(t) * BOT_CONFIG["MAX_SPREAD_ALLOCATION"]
                    - spread_usdc,
                )

                size = size_position(max_new, confidence)
                if size < BOT_CONFIG["MIN_POSITION_SIZE_USDC"]:
                    continue

                sym_a, sym_b = pair_name.split("/")
                is_short = action == "enter_short"

                pos = Position(
                    id=self.next_position_id,
                    type="spread",
                    pair_or_market=pair_name,
                    side_a="short" if is_short else "long",
                    side_b="long" if is_short else "short",
                    size_usdc=size,
                    entry_price_a=self.price_df[f"{sym_a}_price"].iloc[t],
                    entry_price_b=self.price_df[f"{sym_b}_price"].iloc[t],
                    entry_z_score=z,
                    entry_funding_apr=None,
                    opened_at=t,
                    opened_timestamp=self.price_df["timestamp"].iloc[t],
                )
                self._open_position(pos)

    def _evaluate_funding_signals(self, t: int):
        """Check funding signals and open/close basis positions."""
        for sym, market_idx in PERP_MARKETS.items():
            if sym not in self.funding_signals:
                continue

            signals = self.funding_signals[sym]
            if t >= len(signals):
                continue

            row = signals.iloc[t]
            action = row["action"]
            apr = row["apr"]

            existing = self._find_open_position("basis", sym)

            if action == "exit_basis" and existing:
                self._close_position(existing, t, "funding_flip")
                continue

            if action == "enter_basis":
                if existing:
                    continue

                basis_usdc = sum(
                    p.size_usdc for p in self.open_positions if p.type == "basis"
                )
                max_new = max(
                    0,
                    self._compute_portfolio_value(t) * BOT_CONFIG["MAX_BASIS_ALLOCATION"]
                    - basis_usdc,
                )

                size = size_position(max_new, 1.0)
                if size < BOT_CONFIG["MIN_POSITION_SIZE_USDC"]:
                    continue

                pos = Position(
                    id=self.next_position_id,
                    type="basis",
                    pair_or_market=sym,
                    side_a="short" if apr > 0 else "long",
                    side_b=None,
                    size_usdc=size,
                    entry_price_a=self.price_df[f"{sym}_price"].iloc[t],
                    entry_price_b=None,
                    entry_z_score=None,
                    entry_funding_apr=apr,
                    opened_at=t,
                    opened_timestamp=self.price_df["timestamp"].iloc[t],
                )
                self._open_position(pos)

    def _open_position(self, pos: Position):
        """Open a new position."""
        slippage = compute_slippage(pos.size_usdc) / 2  # half on entry
        self.capital -= slippage
        self.result.total_slippage += slippage
        self.result.total_tx_costs += compute_tx_cost() / 2  # half on entry
        self.capital -= compute_tx_cost() / 2

        self.open_positions.append(pos)
        self.next_position_id += 1
        self.result.total_trades += 1

    def _close_position(self, pos: Position, t: int, reason: str):
        """Close a position and realize PnL."""
        pnl = self._unrealized_pnl(pos, t)
        slippage = compute_slippage(pos.size_usdc) / 2  # half on exit
        tx_cost = compute_tx_cost() / 2

        net_pnl = pnl - slippage - tx_cost
        self.capital += net_pnl
        self.result.total_pnl += net_pnl
        self.result.total_slippage += slippage
        self.result.total_tx_costs += tx_cost

        sym_a = pos.pair_or_market.split("/")[0] if pos.type == "spread" else pos.pair_or_market

        closed = ClosedPosition(
            position=pos,
            exit_price_a=self.price_df[f"{sym_a}_price"].iloc[t],
            exit_price_b=(
                self.price_df[f"{pos.pair_or_market.split('/')[1]}_price"].iloc[t]
                if pos.type == "spread"
                else None
            ),
            exit_z_score=(
                self.spread_signals.get(pos.pair_or_market, pd.DataFrame()).iloc[t]["z_score"]
                if pos.type == "spread" and pos.pair_or_market in self.spread_signals and t < len(self.spread_signals[pos.pair_or_market])
                else None
            ),
            realized_pnl=net_pnl,
            close_reason=reason,
            closed_at=t,
            closed_timestamp=self.price_df["timestamp"].iloc[t],
        )
        self.result.closed_positions.append(closed)

        self.open_positions = [p for p in self.open_positions if p.id != pos.id]

    def _find_open_position(self, pos_type: str, name: str) -> Position | None:
        """Find an open position by type and pair/market name."""
        for p in self.open_positions:
            if p.type == pos_type and p.pair_or_market == name:
                return p
        return None

    def _record_state(self, t: int, timestamp: pd.Timestamp):
        """Record portfolio snapshot — mirrors vault_snapshots."""
        portfolio_value = self._compute_portfolio_value(t)
        spread_usdc = sum(p.size_usdc for p in self.open_positions if p.type == "spread")
        basis_usdc = sum(p.size_usdc for p in self.open_positions if p.type == "basis")
        idle = max(0, self.capital - spread_usdc - basis_usdc)
        lending = idle  # simplified: all idle goes to lending

        drawdown = (self.hwm - portfolio_value) / self.hwm if self.hwm > 0 else 0

        # Only record every 288 ticks (once per day) to keep history manageable
        if t % 288 == 0 or t == self.n_ticks - 1:
            self.result.portfolio_history.append(
                PortfolioState(
                    total_value=portfolio_value,
                    lending_usdc=lending,
                    spread_usdc=spread_usdc,
                    basis_usdc=basis_usdc,
                    idle_usdc=0,  # simplified
                    hwm=self.hwm,
                    drawdown_pct=drawdown,
                    timestamp=timestamp,
                )
            )
