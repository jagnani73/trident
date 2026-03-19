import { VoltrClient } from "@voltr/vault-sdk";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import "dotenv/config";

import { VAULT_CONFIG } from "../utils/constants";
import { LoggerService } from "./logger.service";

const logger = LoggerService.scoped("ranger-vault");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require("bs58") as { decode: (input: string) => Uint8Array };

type StrategyType = "drift" | "lending";

export class RangerVaultService {
    private static client: VoltrClient | null = null;
    private static connection: Connection | null = null;
    private static managerKeypair: Keypair | null = null;
    private static vaultAddress: PublicKey | null = null;

    // ── Lifecycle ──────────────────────────────────────────────

    static async init(): Promise<void> {
        const log = logger.scoped("init");

        const rpcUrl = process.env.SOLANA_RPC_URL;
        const privateKey = process.env.SOLANA_PRIVATE_KEY;
        const vaultAddr = process.env.RANGER_VAULT_ADDRESS;

        if (!rpcUrl || !privateKey) {
            log.warn("missing-config", {
                message: "SOLANA_RPC_URL or SOLANA_PRIVATE_KEY not set, skipping vault init",
            });
            return;
        }

        if (!vaultAddr) {
            log.warn("no-vault-address", {
                message: "RANGER_VAULT_ADDRESS not set — vault queries disabled. Run setup-vault.ts first.",
            });
        }

        try {
            const secretKey = privateKey.startsWith("[")
                ? Uint8Array.from(JSON.parse(privateKey))
                : bs58.decode(privateKey);
            this.managerKeypair = Keypair.fromSecretKey(secretKey);
            this.connection = new Connection(rpcUrl, "confirmed");
            this.client = new VoltrClient(this.connection, this.managerKeypair);

            if (vaultAddr) {
                this.vaultAddress = new PublicKey(vaultAddr);
            }

            log.info("initialized", {
                vault: vaultAddr || "not-configured",
                manager: this.managerKeypair.publicKey.toBase58(),
            });
        } catch (error) {
            log.error("init-failed", { error });
            throw error;
        }
    }

    static shutdown(): void {
        this.client = null;
        this.connection = null;
        this.managerKeypair = null;
        this.vaultAddress = null;
        logger.info("shutdown");
    }

    static isAvailable(): boolean {
        return this.client !== null && this.vaultAddress !== null;
    }

    private static getClient(): VoltrClient {
        if (!this.client) throw new Error("RangerVaultService not initialized");
        return this.client;
    }

    private static getVault(): PublicKey {
        if (!this.vaultAddress) throw new Error("Vault address not configured");
        return this.vaultAddress;
    }

    // ── Vault Queries ──────────────────────────────────────────

    static async getVaultAccount() {
        return this.getClient().fetchVaultAccount(this.getVault());
    }

    static async getStrategyPositions() {
        return this.getClient().getPositionAndTotalValuesForVault(this.getVault());
    }

    static async getTotalValue(): Promise<number> {
        const { totalValue } = await this.getStrategyPositions();
        return totalValue;
    }

    static async getAssetPerLp(): Promise<number> {
        return this.getClient().getCurrentAssetPerLpForVault(this.getVault());
    }

    static async getVaultState() {
        const log = logger.scoped("getVaultState");

        try {
            const [vaultAccount, positions, assetPerLp] = await Promise.all([
                this.getVaultAccount(),
                this.getStrategyPositions(),
                this.getAssetPerLp(),
            ]);

            return {
                totalValue: positions.totalValue,
                strategies: positions.strategies,
                assetPerLp,
                maxCap: vaultAccount.vaultConfiguration.maxCap,
                manager: vaultAccount.manager.toBase58(),
                admin: vaultAccount.admin.toBase58(),
            };
        } catch (error) {
            log.error("query-failed", { error });
            throw error;
        }
    }

    // ── Strategy Operations ────────────────────────────────────

    static async depositToStrategy(strategy: StrategyType, amount: BN): Promise<string> {
        const log = logger.scoped("deposit");
        const client = this.getClient();
        const vault = this.getVault();
        const { adaptorProgram, strategyAddress, remainingAccounts } = this.getStrategyConfig(strategy);

        log.info("depositing", {
            strategy,
            amount: amount.toString(),
            strategyAddress: strategyAddress.toBase58(),
        });

        const ix = await client.createDepositStrategyIx(
            {
                depositAmount: amount,
                instructionDiscriminator: null,
                additionalArgs: strategy === "drift"
                    ? this.encodeDriftMarketIndex()
                    : null,
            },
            {
                manager: this.managerKeypair!.publicKey,
                vault,
                vaultAssetMint: new PublicKey(VAULT_CONFIG.USDC_MINT),
                strategy: strategyAddress,
                assetTokenProgram: TOKEN_PROGRAM_ID,
                adaptorProgram,
                remainingAccounts,
            },
        );

        const txSig = await this.sendTransaction(ix);
        log.info("deposited", { strategy, tx: txSig });
        return txSig;
    }

    static async withdrawFromStrategy(strategy: StrategyType, amount: BN): Promise<string> {
        const log = logger.scoped("withdraw");
        const client = this.getClient();
        const vault = this.getVault();
        const { adaptorProgram, strategyAddress, remainingAccounts } = this.getStrategyConfig(strategy);

        log.info("withdrawing", {
            strategy,
            amount: amount.toString(),
            strategyAddress: strategyAddress.toBase58(),
        });

        const ix = await client.createWithdrawStrategyIx(
            {
                withdrawAmount: amount,
                instructionDiscriminator: null,
                additionalArgs: strategy === "drift"
                    ? this.encodeDriftMarketIndex()
                    : null,
            },
            {
                manager: this.managerKeypair!.publicKey,
                vault,
                vaultAssetMint: new PublicKey(VAULT_CONFIG.USDC_MINT),
                strategy: strategyAddress,
                assetTokenProgram: TOKEN_PROGRAM_ID,
                adaptorProgram,
                remainingAccounts,
            },
        );

        const txSig = await this.sendTransaction(ix);
        log.info("withdrawn", { strategy, tx: txSig });
        return txSig;
    }

    // ── Transaction Helper ─────────────────────────────────────

    private static async sendTransaction(
        ...instructions: import("@solana/web3.js").TransactionInstruction[]
    ): Promise<string> {
        const connection = this.connection!;
        const payer = this.managerKeypair!;

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

        const messageV0 = new TransactionMessage({
            payerKey: payer.publicKey,
            recentBlockhash: blockhash,
            instructions,
        }).compileToV0Message();

        const tx = new VersionedTransaction(messageV0);
        tx.sign([payer]);

        const txSig = await connection.sendTransaction(tx, { skipPreflight: false });
        await connection.confirmTransaction(
            { signature: txSig, blockhash, lastValidBlockHeight },
            "confirmed",
        );

        return txSig;
    }

    // ── Strategy Config ────────────────────────────────────────

    private static getStrategyConfig(strategy: StrategyType) {
        const strategyEnvKey = strategy === "drift"
            ? "DRIFT_STRATEGY_ADDRESS"
            : "LENDING_STRATEGY_ADDRESS";
        const strategyAddr = process.env[strategyEnvKey];

        if (!strategyAddr) {
            throw new Error(`${strategyEnvKey} not set — run init-strategies.ts first`);
        }

        const strategyAddress = new PublicKey(strategyAddr);
        const adaptorProgram = new PublicKey(
            strategy === "drift"
                ? VAULT_CONFIG.DRIFT_ADAPTOR_PROGRAM_ID
                : VAULT_CONFIG.LENDING_ADAPTOR_PROGRAM_ID,
        );

        const remainingAccounts = strategy === "drift"
            ? this.getDriftRemainingAccounts(strategyAddress)
            : this.getLendingRemainingAccounts(strategyAddress);

        return { adaptorProgram, strategyAddress, remainingAccounts };
    }

    // ── Drift Remaining Accounts ───────────────────────────────

    private static getDriftRemainingAccounts(strategy: PublicKey) {
        const vault = this.getVault();
        const client = this.getClient();
        const driftProgram = new PublicKey(VAULT_CONFIG.DRIFT_PROGRAM_ID);
        const marketIndex = VAULT_CONFIG.USDC_SPOT_MARKET_INDEX;
        const marketIndexBN = new BN(marketIndex);

        const vaultStrategyAuth = client.findVaultStrategyAuth(vault, strategy);

        // Drift PDAs
        const [counterPartyTaAuth] = PublicKey.findProgramAddressSync(
            [Buffer.from("spot_market_vault"), marketIndexBN.toArrayLike(Buffer, "le", 2)],
            driftProgram,
        );

        const [userStats] = PublicKey.findProgramAddressSync(
            [Buffer.from("user_stats"), vaultStrategyAuth.toBuffer()],
            driftProgram,
        );

        const [user] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user"),
                vaultStrategyAuth.toBuffer(),
                new BN(0).toArrayLike(Buffer, "le", 2),
            ],
            driftProgram,
        );

        const [spotMarket] = PublicKey.findProgramAddressSync(
            [Buffer.from("spot_market"), marketIndexBN.toArrayLike(Buffer, "le", 2)],
            driftProgram,
        );

        return [
            { pubkey: counterPartyTaAuth, isSigner: false, isWritable: true },
            { pubkey: this.getDriftSpotMarketVaultAta(counterPartyTaAuth), isSigner: false, isWritable: true },
            { pubkey: driftProgram, isSigner: false, isWritable: false },
            { pubkey: new PublicKey(VAULT_CONFIG.DRIFT_STATE), isSigner: false, isWritable: false },
            { pubkey: user, isSigner: false, isWritable: true },
            { pubkey: userStats, isSigner: false, isWritable: true },
            { pubkey: new PublicKey(VAULT_CONFIG.USDC_ORACLE), isSigner: false, isWritable: false },
            { pubkey: spotMarket, isSigner: false, isWritable: true },
        ];
    }

    private static getDriftSpotMarketVaultAta(spotMarketVaultAuth: PublicKey): PublicKey {
        // The spot market vault ATA is the same as the authority for Drift's spot market vault
        // Drift stores tokens directly at the PDA, not in an associated token account
        return spotMarketVaultAuth;
    }

    // ── Lending Remaining Accounts ─────────────────────────────

    private static getLendingRemainingAccounts(_strategy: PublicKey) {
        // Lending adaptor has simpler account requirements
        // The exact accounts depend on the lending protocol (Drift lending in this case)
        // For Drift lending, the remaining accounts are similar to the Drift adaptor
        const driftProgram = new PublicKey(VAULT_CONFIG.DRIFT_PROGRAM_ID);
        const vault = this.getVault();
        const client = this.getClient();
        const vaultStrategyAuth = client.findVaultStrategyAuth(vault, _strategy);
        const marketIndex = VAULT_CONFIG.USDC_SPOT_MARKET_INDEX;
        const marketIndexBN = new BN(marketIndex);

        const [counterPartyTaAuth] = PublicKey.findProgramAddressSync(
            [Buffer.from("spot_market_vault"), marketIndexBN.toArrayLike(Buffer, "le", 2)],
            driftProgram,
        );

        const [userStats] = PublicKey.findProgramAddressSync(
            [Buffer.from("user_stats"), vaultStrategyAuth.toBuffer()],
            driftProgram,
        );

        const [user] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user"),
                vaultStrategyAuth.toBuffer(),
                new BN(0).toArrayLike(Buffer, "le", 2),
            ],
            driftProgram,
        );

        const [spotMarket] = PublicKey.findProgramAddressSync(
            [Buffer.from("spot_market"), marketIndexBN.toArrayLike(Buffer, "le", 2)],
            driftProgram,
        );

        return [
            { pubkey: counterPartyTaAuth, isSigner: false, isWritable: true },
            { pubkey: counterPartyTaAuth, isSigner: false, isWritable: true },
            { pubkey: driftProgram, isSigner: false, isWritable: false },
            { pubkey: new PublicKey(VAULT_CONFIG.DRIFT_STATE), isSigner: false, isWritable: false },
            { pubkey: user, isSigner: false, isWritable: true },
            { pubkey: userStats, isSigner: false, isWritable: true },
            { pubkey: new PublicKey(VAULT_CONFIG.USDC_ORACLE), isSigner: false, isWritable: false },
            { pubkey: spotMarket, isSigner: false, isWritable: true },
        ];
    }

    // ── Helpers ─────────────────────────────────────────────────

    private static encodeDriftMarketIndex(): Buffer {
        return Buffer.from(
            new BN(VAULT_CONFIG.USDC_SPOT_MARKET_INDEX).toArrayLike(Buffer, "le", 2),
        );
    }
}
