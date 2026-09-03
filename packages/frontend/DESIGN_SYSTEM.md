# Trident — Design System

> **Source of truth** for all UI/UX decisions across the Trident vault dashboard.
> Stack: Next.js 16, React 19, Tailwind CSS v4, shadcn/ui (new-york), Recharts, Lucide React.

---

## 1. Brand Identity

| Attribute    | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| Product Name | Trident                                                              |
| Product Type | Vault Strategy Dashboard (DeFi / Solana)                             |
| Industry     | Crypto / Quantitative Trading / Yield Optimization                   |
| Aesthetic    | Dark-first, trading terminal, data-dense. Clean, precise, technical. |
| Personality  | Sharp, analytical, trustworthy                                       |
| Target User  | Vault managers, strategy operators                                   |

The UI should feel like a professional trading terminal — think Bloomberg Terminal meets modern web. Dark backgrounds, monospace numbers, real-time data updates. Not a marketing page.

---

## 2. Color Palette

Cyan/teal-based. **Dark mode is the default** (trading terminal convention). Light mode available via `.dark` class toggle.

### Dark Mode (`:root` — default)

```css
/* Surface hierarchy — very dark, near-black */
--background: oklch(0.12 0.01 220);
--foreground: oklch(0.93 0.005 220);
--card: oklch(0.16 0.01 220);
--card-foreground: oklch(0.93 0.005 220);
--popover: oklch(0.16 0.01 220);
--popover-foreground: oklch(0.93 0.005 220);

/* Brand cyan/teal */
--primary: oklch(0.72 0.14 195);
--primary-foreground: oklch(0.12 0.01 220);

/* Supporting */
--secondary: oklch(0.22 0.01 220);
--secondary-foreground: oklch(0.93 0.005 220);
--muted: oklch(0.22 0.012 220);
--muted-foreground: oklch(0.6 0.015 220);
--accent: oklch(0.22 0.025 195);
--accent-foreground: oklch(0.93 0.005 220);
--destructive: oklch(0.65 0.22 25);

/* Chrome */
--border: oklch(0.26 0.012 220);
--input: oklch(0.26 0.012 220);
--ring: oklch(0.72 0.14 195);
--radius: 0.5rem;
```

### Light Mode (`.light`)

```css
--background: oklch(0.97 0.003 220);
--foreground: oklch(0.15 0.015 220);
--card: oklch(1 0 0);
--card-foreground: oklch(0.15 0.015 220);
--popover: oklch(1 0 0);
--popover-foreground: oklch(0.15 0.015 220);

--primary: oklch(0.52 0.16 195);
--primary-foreground: oklch(0.97 0.003 220);

--secondary: oklch(0.94 0.008 220);
--secondary-foreground: oklch(0.2 0.015 220);
--muted: oklch(0.95 0.005 220);
--muted-foreground: oklch(0.45 0.015 220);
--accent: oklch(0.94 0.02 195);
--accent-foreground: oklch(0.2 0.015 220);
--destructive: oklch(0.577 0.245 27.33);

--border: oklch(0.88 0.006 220);
--input: oklch(0.88 0.006 220);
--ring: oklch(0.52 0.16 195);
```

### Trading Semantic Colors

Custom tokens for financial/trading data. Defined in both modes.

| Token                  | Dark                   | Light                      | Usage                       |
| ---------------------- | ---------------------- | -------------------------- | --------------------------- |
| `--profit`             | `oklch(0.72 0.18 152)` | `oklch(0.45 0.15 152)`     | Profit, positive PnL, green |
| `--profit-foreground`  | `oklch(0.12 0 0)`      | `oklch(0.97 0 0)`          | Text on profit bg           |
| `--profit-muted`       | `oklch(0.20 0.04 152)` | `oklch(0.94 0.05 152)`     | Badge/cell bg               |
| `--loss`               | `oklch(0.70 0.20 25)`  | `oklch(0.577 0.245 27.33)` | Loss, negative PnL, red     |
| `--loss-foreground`    | `oklch(0.12 0 0)`      | `oklch(0.97 0 0)`          | Text on loss bg             |
| `--loss-muted`         | `oklch(0.20 0.04 25)`  | `oklch(0.95 0.04 25)`      | Badge/cell bg               |
| `--warning`            | `oklch(0.78 0.15 68)`  | `oklch(0.68 0.17 68)`      | Caution, near-threshold     |
| `--warning-foreground` | `oklch(0.12 0.02 50)`  | `oklch(0.21 0.02 50)`      | Text on warning bg          |
| `--warning-muted`      | `oklch(0.22 0.04 68)`  | `oklch(0.95 0.04 68)`      | Badge/cell bg               |

Use as: `text-profit`, `bg-profit-muted`, `text-loss`, etc.

### Chart Palette (8 colors)

| Token       | Dark                   | Light                  | Visual         |
| ----------- | ---------------------- | ---------------------- | -------------- |
| `--chart-1` | `oklch(0.72 0.14 195)` | `oklch(0.52 0.16 195)` | Cyan (primary) |
| `--chart-2` | `oklch(0.70 0.18 152)` | `oklch(0.45 0.15 152)` | Green (profit) |
| `--chart-3` | `oklch(0.78 0.15 68)`  | `oklch(0.68 0.17 68)`  | Amber          |
| `--chart-4` | `oklch(0.65 0.18 305)` | `oklch(0.54 0.22 305)` | Purple         |
| `--chart-5` | `oklch(0.70 0.20 25)`  | `oklch(0.60 0.21 22)`  | Coral/Red      |
| `--chart-6` | `oklch(0.68 0.14 250)` | `oklch(0.50 0.18 250)` | Blue           |
| `--chart-7` | `oklch(0.66 0.16 340)` | `oklch(0.55 0.20 340)` | Rose           |
| `--chart-8` | `oklch(0.68 0.12 130)` | `oklch(0.58 0.14 130)` | Olive          |

### Strategy Layer Colors

| Layer   | Color     | Token  |
| ------- | --------- | ------ |
| Lending | `chart-1` | Cyan   |
| Spread  | `chart-4` | Purple |
| Basis   | `chart-6` | Blue   |
| Idle    | `muted`   | Gray   |

---

## 3. Typography

**Font stack** (configured via `next/font/google`):

- UI text: Geist Sans (`font-sans`)
- Numeric/trading data: Geist Mono (`font-mono`)

### Type Scale (Compact)

| Token                | Size        | Weight          | Usage                                        |
| -------------------- | ----------- | --------------- | -------------------------------------------- |
| Page title           | `text-lg`   | `font-semibold` | Page headings ("Dashboard", "Positions")     |
| Section heading      | `text-base` | `font-semibold` | Card titles, panel headers                   |
| Body                 | `text-sm`   | `font-normal`   | Default body text, descriptions              |
| Table header         | `text-xs`   | `font-medium`   | Column headers + `tracking-wide uppercase`   |
| Table cell           | `text-sm`   | `font-normal`   | Data cells                                   |
| Table cell (numeric) | `text-sm`   | `font-medium`   | USD amounts, APY, z-scores — use `font-mono` |
| Label                | `text-xs`   | `font-medium`   | Form labels, metadata, badge text            |
| Caption              | `text-xs`   | `font-normal`   | Help text, timestamps, wallet addresses      |

### Rules

- ALL numeric data uses `font-mono` for tabular alignment
- USD: 2 decimal places, `text-right` in tables
- APY/percentages: 2 decimal places
- Z-scores: 2 decimal places, colored by direction
- Wallet addresses: truncated `0xAbC...xYz` in `font-mono text-xs`
- Max heading weight: `font-semibold` (600)
- Minimum font size: `text-xs` (12px)

---

## 4. Layout Architecture

Full-width dashboard, top nav + content. No sidebar — there are only four pages, so top nav covers navigation without the extra chrome.

```
+------------------------------------------------------------------+
|  Top Bar (h-12, fixed, full width, z-40)                         |
|  [Trident]  [Dashboard] [Positions] [Performance] [Signals]      |
|                                               [theme] [status]   |
+------------------------------------------------------------------+
|  Content Area (scrollable, p-4)                                  |
|  +------------------------------------------------------------+ |
|  | Page Content                                                | |
|  |                                                             | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### Top Bar

- Height: `h-12` (48px)
- Position: `fixed top-0 left-0 right-0 z-40`
- Background: `bg-card border-b border-border`
- Left: Trident brand + strategy name
- Center: Page tabs. Active: `text-primary` + 2px bottom border
- Right: Theme toggle + bot status indicator (green dot = running)

### Content Area

- Margin: `mt-12` always
- Padding: `p-4`
- Max width: none — full fluid (charts and tables need horizontal space)

---

## 5. Component Patterns

### 5.1 KPI Cards

```
Container:  bg-card border border-border rounded-lg p-3
Title:      text-xs font-medium text-muted-foreground uppercase tracking-wide
Value:      text-xl font-semibold font-mono text-foreground (mt-1)
Delta:      text-xs font-mono (mt-0.5)
            profit: text-profit
            loss: text-loss
            neutral: text-muted-foreground
Grid:       grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3
```

### 5.2 Position Tables

```
Wrapper:       rounded-lg border border-border overflow-hidden
Header row:    bg-muted text-muted-foreground text-xs font-medium tracking-wide uppercase
Body row:      border-b border-border hover:bg-muted/50 transition-colors text-sm
PnL columns:   text-right font-mono font-medium
               Positive: text-profit
               Negative: text-loss
               Zero: text-muted-foreground
Empty state:   Lucide Inbox icon + "No active positions" centered
```

### 5.3 Status Indicators

| Status       | Style                                        |
| ------------ | -------------------------------------------- |
| Bot running  | Green dot (`bg-profit`) + "Running" text     |
| Bot stopped  | Gray dot (`bg-muted-foreground`) + "Stopped" |
| Lending      | `bg-chart-1/10 text-chart-1` badge           |
| Spread trade | `bg-chart-4/10 text-chart-4` badge           |
| Basis trade  | `bg-chart-6/10 text-chart-6` badge           |

### 5.4 Buttons

| Variant     | Classes                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| Primary     | `bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-sm font-medium` |
| Secondary   | `bg-secondary text-secondary-foreground hover:bg-secondary/80 h-8 px-3 text-sm`       |
| Ghost       | `hover:bg-accent hover:text-accent-foreground h-8 px-2 text-sm`                       |
| Destructive | `bg-destructive text-white hover:bg-destructive/90 h-8 px-3 text-sm font-medium`      |

---

## 6. Chart Guidelines (Recharts)

### Chart Type Mapping

| Chart Type  | Use Case                                                   |
| ----------- | ---------------------------------------------------------- |
| Area        | Vault TVL over time, cumulative PnL                        |
| Line        | APY trends, z-score evolution, funding rate history        |
| Bar         | Allocation breakdown (stacked), daily PnL                  |
| Pie / Donut | Current allocation split (lending / spread / basis / idle) |

### Axis Formatting

- **Y-axis (USD)**: `$12.5K`, `$1.2M` — compact notation
- **Y-axis (percentage)**: `N.NN%` (2 decimal APY)
- **Y-axis (z-score)**: `-2.0` to `+2.0` — signed, 1 decimal
- **X-axis (time)**: `MMM DD` for days, `HH:mm` for intraday
- **Grid lines**: `stroke: var(--border)`, dashed

### Container

Always `<ResponsiveContainer width="100%" height={300}>`. KPI-embedded mini charts: 120-160px.

---

## 7. Data Display Patterns

### Currency (USD)

- Format: `$1,234.56` — USD, 2 decimals
- Alignment: `text-right font-mono`
- Negative: `-$1,234.56` (minus prefix)
- Zero: `$0.00`

### Percentages (APY, Drawdown)

- Format: `N.NN%` (2 decimals)
- Alignment: `text-right font-mono`
- APY positive: `text-profit`
- Drawdown: `text-loss`

### Z-Scores

- Format: `+2.34` / `-1.56` — always signed
- Color: > +1.5 or < -1.5: `text-warning`, > +2.0 or < -2.0: `text-profit` (opportunity)
- Alignment: `text-right font-mono`

### Wallet Addresses

- Truncate: `AbC1...xYz9` (4 chars...4 chars)
- Style: `font-mono text-xs text-muted-foreground`
- Click to copy

### Null / Missing Data

- Display as `--` (em dash), `text-muted-foreground`

---

## 8. Iconography

**Library**: Lucide React

| Concept       | Icon              |
| ------------- | ----------------- |
| Dashboard     | `LayoutDashboard` |
| Positions     | `ArrowLeftRight`  |
| Performance   | `TrendingUp`      |
| Signals       | `Activity`        |
| Bot status    | `Bot`             |
| Lending layer | `Landmark`        |
| Spread trade  | `GitCompare`      |
| Basis trade   | `Layers`          |
| Profit / Up   | `TrendingUp`      |
| Loss / Down   | `TrendingDown`    |
| Warning       | `AlertTriangle`   |
| Settings      | `Settings`        |
| Copy address  | `Copy`            |
| External link | `ExternalLink`    |
| Theme toggle  | `Sun` / `Moon`    |

---

## 9. Anti-Patterns

| Anti-Pattern                         | Why                                  | Correct Approach                                  |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------- |
| Emojis as UI elements                | Inconsistent, unprofessional         | Lucide icons                                      |
| Light mode default                   | Trading terminals are dark           | Dark mode default                                 |
| `rounded-full` on cards              | Too casual for finance               | `rounded-md` or `rounded-lg`                      |
| Gradient backgrounds                 | Startup aesthetic                    | Solid dark backgrounds                            |
| Box shadows for depth                | Flat is professional                 | Borders for separation                            |
| Color-only status indication         | Fails accessibility                  | Pair with text label or icon                      |
| Red/green for non-PnL data           | Reserves trading semantics           | Use chart palette                                 |
| `text-primary` for financial numbers | Cyan is for actions/links            | Use `text-foreground`, `text-profit`, `text-loss` |
| Truncating USD values                | Financial data must be fully visible | Size columns to fit                               |
