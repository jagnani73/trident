import type {
    OraclePriceData,
    PerpMarketAccount,
    PerpPosition,
    SpotMarketAccount,
    SpotPosition,
} from "@drift-labs/sdk";
import {
    BASE_PRECISION,
    BulkAccountLoader,
    calculatePositionPNL,
    calculateReservePrice,
    convertToNumber,
    DriftClient,
    FUNDING_RATE_PRECISION,
    OrderType,
    PositionDirection,
    PRICE_PRECISION,
    QUOTE_PRECISION,
    Wallet,
} from "@drift-labs/sdk";
import { Connection, Keypair } from "@solana/web3.js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require("bs58") as { decode: (input: string) => Uint8Array };
import BN from "bn.js";
import "dotenv/config";
import { PERP_MARKETS, SPOT_MARKETS } from "../utils/constants";
import type {
    FundingRateInfo,
    PerpMarketKey,
    PositionInfo,
    SpreadPairPrices,
} from "../utils/types/services.types";
import { LoggerService } from "./logger.service";

const logger = LoggerService.scoped("drift");

const ZERO = new BN(0);
const LEVERAGE_PRECISION = new BN(10_000);

export class DriftService {
    private static client: DriftClient | null = null;

    static getClient(): DriftClient {
        if (!this.client) throw new Error("DriftService not initialized");
        return this.client;
    }

    static async init(): Promise<void> {
        if (this.client) return;

        const log = logger.scoped("init");

        const rpcUrl = process.env.SOLANA_RPC_URL;
        const privateKey = process.env.SOLANA_PRIVATE_KEY;
        const env = (process.env.DRIFT_ENV || "devnet") as "mainnet-beta" | "devnet";

        if (!rpcUrl || !privateKey) {
            log.warn("missing-config", {
                message: "SOLANA_RPC_URL or SOLANA_PRIVATE_KEY not set, skipping Drift init",
            });
            return;
        }

        try {
            const secretKey = privateKey.startsWith("[")
                ? Uint8Array.from(JSON.parse(privateKey))
                : bs58.decode(privateKey);
            const keypair = Keypair.fromSecretKey(secretKey);
            const wallet = new Wallet(keypair);
            const connection = new Connection(rpcUrl, "confirmed");
            const bulkAccountLoader = new BulkAccountLoader(connection, "confirmed", 10_000);

            this.client = new DriftClient({
                connection,
                wallet,
                env,
                accountSubscription: {
                    type: "polling",
                    accountLoader: bulkAccountLoader,
                },
                perpMarketIndexes: [PERP_MARKETS.SOL, PERP_MARKETS.BTC, PERP_MARKETS.ETH],
                spotMarketIndexes: [SPOT_MARKETS.USDC, SPOT_MARKETS.SOL, SPOT_MARKETS.ETH],
                activeSubAccountId: +(process.env.DRIFT_SUBACCOUNT || 0),
            });

            await this.client.subscribe();
            log.info("connected", { env, subAccount: this.client.activeSubAccountId });
        } catch (error) {
            log.error("init-failed", { error });
            throw error;
        }
    }

    /**
     * Ensure a Drift user account exists on-chain for the active subaccount.
     * Call during bot-engine warmup — not needed for data-collector (read-only).
     */
    static async initializeUserIfNeeded(): Promise<void> {
        const log = logger.scoped("init-user");
        const client = this.getClient();

        if (this.hasUser()) {
            log.info("user-exists", { subAccount: client.activeSubAccountId });
            return;
        }

        log.info("creating-user", {
            wallet: client.wallet.publicKey.toBase58(),
            subAccount: client.activeSubAccountId,
        });

        const [txSig] = await client.initializeUserAccount();
        log.info("user-created", { tx: txSig, subAccount: client.activeSubAccountId });
    }

    static async shutdown(): Promise<void> {
        if (this.client) {
            await this.client.unsubscribe();
            this.client = null;
            logger.info("disconnected");
        }
    }

    // ── Market Data ──────────────────────────────────────────────

    static getPerpMarket(marketIndex: number): PerpMarketAccount {
        return this.getClient().getPerpMarketAccount(marketIndex)!;
    }

    static getSpotMarket(marketIndex: number): SpotMarketAccount {
        return this.getClient().getSpotMarketAccount(marketIndex)!;
    }

    static getOraclePrice(marketIndex: number): OraclePriceData {
        return this.getClient().getOracleDataForPerpMarket(marketIndex);
    }

    static getOraclePriceNumber(marketIndex: number): number {
        const oracle = this.getOraclePrice(marketIndex);
        return convertToNumber(oracle.price, PRICE_PRECISION);
    }

    private static getMMOracle(marketIndex: number) {
        const oracle = this.getClient().getOracleDataForPerpMarket(marketIndex);
        return { ...oracle, isMMOracleActive: false };
    }

    static getMarkPrice(marketIndex: number): number {
        const market = this.getPerpMarket(marketIndex);
        return convertToNumber(calculateReservePrice(market, this.getMMOracle(marketIndex)), PRICE_PRECISION);
    }

    // ── Funding Rates ────────────────────────────────────────────

    static getFundingRate(marketIndex: number, symbol: string): FundingRateInfo {
        const market = this.getPerpMarket(marketIndex);
        const oraclePrice = this.getOraclePriceNumber(marketIndex);

        // Use last settled funding rate from market account (always available)
        // instead of calculateAllEstimatedFundingRate which needs oracle TWAP
        // subscriptions that BulkAccountLoader doesn't provide
        const fundingRate = convertToNumber(
            market.amm.lastFundingRate,
            FUNDING_RATE_PRECISION,
        );
        const markPrice = oraclePrice > 0
            ? convertToNumber(calculateReservePrice(market, this.getMMOracle(marketIndex)), PRICE_PRECISION)
            : 0;
        const fundingRateApr = oraclePrice > 0 ? (fundingRate / oraclePrice) * 24 * 365 * 100 : 0;

        return {
            marketIndex,
            symbol,
            fundingRate,
            fundingRateApr,
            oraclePrice,
            markPrice,
            lastFundingTs: market.amm.lastFundingRateTs.toNumber(),
        };
    }

    static getAllFundingRates(): FundingRateInfo[] {
        return Object.entries(PERP_MARKETS).map(([symbol, index]) =>
            this.getFundingRate(index, symbol),
        );
    }

    // ── Spread Prices ────────────────────────────────────────────

    static getSpreadPairPrices(symbolA: PerpMarketKey, symbolB: PerpMarketKey): SpreadPairPrices {
        const priceA = this.getOraclePriceNumber(PERP_MARKETS[symbolA]);
        const priceB = this.getOraclePriceNumber(PERP_MARKETS[symbolB]);

        return {
            pair: `${symbolA}/${symbolB}`,
            priceA,
            priceB,
            ratio: priceB > 0 ? priceA / priceB : 0,
        };
    }

    // ── Positions ────────────────────────────────────────────────

    static getPerpPosition(marketIndex: number): PerpPosition | undefined {
        if (!this.hasUser()) return undefined;
        const user = this.getClient().getUser();
        return user.getPerpPosition(marketIndex) ?? undefined;
    }

    static getSpotPosition(marketIndex: number): SpotPosition | undefined {
        if (!this.hasUser()) return undefined;
        const user = this.getClient().getUser();
        return user.getSpotPosition(marketIndex) ?? undefined;
    }

    static getPositionInfo(marketIndex: number): PositionInfo | null {
        const position = this.getPerpPosition(marketIndex);
        if (!position || position.baseAssetAmount.isZero()) return null;

        const market = this.getPerpMarket(marketIndex);
        const oracle = this.getOraclePrice(marketIndex);
        const pnl = calculatePositionPNL(market, position, false, oracle);

        return {
            marketIndex,
            baseAmount: convertToNumber(position.baseAssetAmount, BASE_PRECISION),
            quoteAmount: convertToNumber(position.quoteAssetAmount, QUOTE_PRECISION),
            unrealizedPnl: convertToNumber(pnl, QUOTE_PRECISION),
            isLong: position.baseAssetAmount.gt(ZERO),
        };
    }

    static getAllPositionInfos(): PositionInfo[] {
        return Object.values(PERP_MARKETS)
            .map((index) => this.getPositionInfo(index))
            .filter((p): p is PositionInfo => p !== null);
    }

    // ── Account Health ───────────────────────────────────────────

    /** Check if the DriftClient has a loaded user account (subaccount exists on-chain). */
    static hasUser(): boolean {
        try {
            this.getClient().getUser();
            return true;
        } catch {
            return false;
        }
    }

    static getFreeCollateral(): number {
        if (!this.hasUser()) return 0;
        const user = this.getClient().getUser();
        return convertToNumber(user.getFreeCollateral(), QUOTE_PRECISION);
    }

    static getTotalCollateral(): number {
        if (!this.hasUser()) return 0;
        const user = this.getClient().getUser();
        return convertToNumber(user.getTotalCollateral(), QUOTE_PRECISION);
    }

    static getLeverage(): number {
        if (!this.hasUser()) return 0;
        const user = this.getClient().getUser();
        return convertToNumber(user.getLeverage(), LEVERAGE_PRECISION);
    }

    // ── Order Execution ──────────────────────────────────────────

    static async placePerpMarketOrder(
        marketIndex: number,
        direction: "long" | "short",
        sizeBase: number,
    ): Promise<string> {
        const log = logger.scoped("place-perp-order");
        const client = this.getClient();

        const baseAmount = client.convertToPerpPrecision(sizeBase);
        const dir = direction === "long" ? PositionDirection.LONG : PositionDirection.SHORT;

        log.info("placing", { marketIndex, direction, sizeBase });

        const tx = await client.placePerpOrder({
            orderType: OrderType.MARKET,
            marketIndex,
            direction: dir,
            baseAssetAmount: baseAmount,
        });

        log.info("placed", { marketIndex, tx });
        return tx;
    }

    static async closePosition(marketIndex: number): Promise<string> {
        const log = logger.scoped("close-position");
        log.info("closing", { marketIndex });

        const tx = await this.getClient().closePosition(marketIndex);
        log.info("closed", { marketIndex, tx });
        return tx;
    }

    static async cancelAllOrders(): Promise<string> {
        const tx = await this.getClient().cancelOrders();
        logger.info("cancelled-all-orders", { tx });
        return tx;
    }

    // ── Spot / Lending ───────────────────────────────────────────

    static async deposit(marketIndex: number, amount: number): Promise<string> {
        const log = logger.scoped("deposit");
        const client = this.getClient();

        const precisionAmount = client.convertToSpotPrecision(marketIndex, amount);
        const tokenAccount = await client.getAssociatedTokenAccount(marketIndex);

        log.info("depositing", { marketIndex, amount });
        const tx = await client.deposit(precisionAmount, marketIndex, tokenAccount);
        log.info("deposited", { marketIndex, tx });
        return tx;
    }

    static async withdraw(marketIndex: number, amount: number): Promise<string> {
        const log = logger.scoped("withdraw");
        const client = this.getClient();

        const precisionAmount = client.convertToSpotPrecision(marketIndex, amount);
        const tokenAccount = await client.getAssociatedTokenAccount(marketIndex);

        log.info("withdrawing", { marketIndex, amount });
        const tx = await client.withdraw(precisionAmount, marketIndex, tokenAccount);
        log.info("withdrawn", { marketIndex, tx });
        return tx;
    }
}
