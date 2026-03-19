import type { AppErrorPublic } from "../errors";

export type ResponseWithData<T> =
    | {
          success: true;
          data: T;
      }
    | {
          success: false;
          data: AppErrorPublic;
      };

export type Hex = `0x${string}`;

// ── Strategy Signals ────────────────────────────────────────────

export type SpreadSignalAction = "enter_short" | "enter_long" | "exit" | "hold";

export interface SpreadSignal {
    pair: string;
    action: SpreadSignalAction;
    zScore: number;
    ratio: number;
    meanRatio: number;
    confidence: number;
    timestamp: string;
}

export type FundingSignalAction = "enter_basis" | "exit_basis" | "hold";

export interface FundingSignal {
    marketIndex: number;
    symbol: string;
    action: FundingSignalAction;
    fundingRateApr: number;
    avgFundingRateApr: number;
    isFlip: boolean;
    timestamp: string;
}
