// Initialize Drift strategy on the vault
// Usage: npx tsx scripts/add-strategies.ts
//
// Prerequisites: RANGER_VAULT_ADDRESS must be set in .env (run setup-vault.ts first)
// After running, add DRIFT_STRATEGY_ADDRESS to .env.

import {
    Connection,
    Keypair,
    PublicKey,
    SYSVAR_RENT_PUBKEY,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { SEEDS, VoltrClient } from "@voltr/vault-sdk";
import BN from "bn.js";
import "dotenv/config";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require("bs58") as { decode: (input: string) => Uint8Array };

const LENDING_ADAPTOR = new PublicKey("aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz");
const DRIFT_PROGRAM = new PublicKey("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH");
const DRIFT_STATE = new PublicKey("5zpq7DvB6UdFFvpmBPspGPNfUGoBRRCE2HHg5u3gxcsN");
const USDC_MARKET_INDEX = 0;
const SUB_ACCOUNT_ID = 0;

async function main() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    const vaultAddr = process.env.RANGER_VAULT_ADDRESS;

    if (!rpcUrl || !privateKey || !vaultAddr) {
        console.error("Set SOLANA_RPC_URL, SOLANA_PRIVATE_KEY, and RANGER_VAULT_ADDRESS in .env");
        process.exit(1);
    }

    const secretKey = privateKey.startsWith("[")
        ? Uint8Array.from(JSON.parse(privateKey))
        : bs58.decode(privateKey);
    const payer = Keypair.fromSecretKey(secretKey);
    const connection = new Connection(rpcUrl, "confirmed");
    const vc = new VoltrClient(connection, payer);
    const vault = new PublicKey(vaultAddr);

    console.log(`[add-strategies] Vault: ${vault.toBase58()}`);
    console.log(`[add-strategies] Manager: ${payer.publicKey.toBase58()}`);

    // Derive strategy PDA (deterministic from spot market vault + lending adaptor)
    const marketIndexBN = new BN(USDC_MARKET_INDEX);
    const [counterPartyTa] = PublicKey.findProgramAddressSync(
        [Buffer.from("spot_market_vault"), marketIndexBN.toArrayLike(Buffer, "le", 2)],
        DRIFT_PROGRAM,
    );

    const [strategy] = PublicKey.findProgramAddressSync(
        [SEEDS.STRATEGY, counterPartyTa.toBuffer()],
        LENDING_ADAPTOR,
    );

    console.log(`[add-strategies] Strategy (PDA): ${strategy.toBase58()}`);

    // Derive Drift PDAs for the vault strategy authority
    const { vaultStrategyAuth } = vc.findVaultStrategyAddresses(vault, strategy);

    const [userStats] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_stats"), vaultStrategyAuth.toBuffer()],
        DRIFT_PROGRAM,
    );

    const [user] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("user"),
            vaultStrategyAuth.toBuffer(),
            new BN(SUB_ACCOUNT_ID).toArrayLike(Buffer, "le", 2),
        ],
        DRIFT_PROGRAM,
    );

    // Remaining accounts for Drift strategy init (matches Voltr client-scripts pattern)
    const remainingAccounts = [
        { pubkey: DRIFT_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: userStats, isSigner: false, isWritable: true },
        { pubkey: DRIFT_STATE, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    const initStrategyIx = await vc.createInitializeStrategyIx(
        {
            instructionDiscriminator: null,
            additionalArgs: null,
        },
        {
            payer: payer.publicKey,
            vault,
            manager: payer.publicKey,
            strategy,
            adaptorProgram: LENDING_ADAPTOR,
            remainingAccounts,
        },
    );

    console.log("[add-strategies] Initializing Drift strategy...");

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [initStrategyIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([payer]);

    const txSig = await connection.sendTransaction(tx, { skipPreflight: false });
    await connection.confirmTransaction(
        { signature: txSig, blockhash, lastValidBlockHeight },
        "confirmed",
    );

    console.log(`[add-strategies] Transaction confirmed: ${txSig}`);
    console.log("");
    console.log("Add this to your .env:");
    console.log(`DRIFT_STRATEGY_ADDRESS=${strategy.toBase58()}`);
}

main().catch((err) => {
    console.error("[add-strategies] Failed:", err);
    process.exit(1);
});
