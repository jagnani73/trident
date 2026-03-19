// Initialize Ranger vault on-chain + add adaptors
// Usage: npx tsx packages/backend/scripts/scripts/setup-vault.ts
//
// After running, add the output RANGER_VAULT_ADDRESS to your .env file.

import {
    Connection,
    Keypair,
    PublicKey,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { VoltrClient } from "@voltr/vault-sdk";
import BN from "bn.js";
import "dotenv/config";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require("bs58") as { decode: (input: string) => Uint8Array };

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const DRIFT_ADAPTOR = new PublicKey("EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP");
const LENDING_ADAPTOR = new PublicKey("aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz");

async function main() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
        console.error("Set SOLANA_RPC_URL and SOLANA_PRIVATE_KEY in .env");
        process.exit(1);
    }

    const secretKey = privateKey.startsWith("[")
        ? Uint8Array.from(JSON.parse(privateKey))
        : bs58.decode(privateKey);
    const payer = Keypair.fromSecretKey(secretKey);
    const connection = new Connection(rpcUrl, "confirmed");
    const vc = new VoltrClient(connection, payer);

    console.log(`[setup-vault] Payer: ${payer.publicKey.toBase58()}`);

    // Generate a new vault keypair
    const vaultKeypair = Keypair.generate();
    console.log(`[setup-vault] Vault address: ${vaultKeypair.publicKey.toBase58()}`);

    // Build vault initialization instruction
    const initVaultIx = await vc.createInitializeVaultIx(
        {
            config: {
                maxCap: new BN("1000000000000"), // 1M USDC (6 decimals)
                startAtTs: new BN(Math.floor(Date.now() / 1000)),
                lockedProfitDegradationDuration: new BN(3600), // 1 hour
                managerManagementFee: 100, // 1%
                managerPerformanceFee: 1000, // 10%
                adminManagementFee: 0,
                adminPerformanceFee: 0,
                redemptionFee: 0,
                issuanceFee: 0,
                withdrawalWaitingPeriod: new BN(0), // instant withdrawals
            },
            name: "Trident USDC Vault",
            description: "Multi-strategy USDC yield vault on Drift Protocol",
        },
        {
            vault: vaultKeypair.publicKey,
            vaultAssetMint: USDC_MINT,
            admin: payer.publicKey,
            manager: payer.publicKey,
            payer: payer.publicKey,
        },
    );

    // Add Drift adaptor
    const addDriftAdaptorIx = await vc.createAddAdaptorIx({
        vault: vaultKeypair.publicKey,
        payer: payer.publicKey,
        admin: payer.publicKey,
        adaptorProgram: DRIFT_ADAPTOR,
    });

    // Add Lending adaptor
    const addLendingAdaptorIx = await vc.createAddAdaptorIx({
        vault: vaultKeypair.publicKey,
        payer: payer.publicKey,
        admin: payer.publicKey,
        adaptorProgram: LENDING_ADAPTOR,
    });

    // Send transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

    const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [initVaultIx, addDriftAdaptorIx, addLendingAdaptorIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([payer, vaultKeypair]);

    console.log("[setup-vault] Sending transaction...");
    const txSig = await connection.sendTransaction(tx, { skipPreflight: false });
    await connection.confirmTransaction(
        { signature: txSig, blockhash, lastValidBlockHeight },
        "confirmed",
    );

    console.log(`[setup-vault] Transaction confirmed: ${txSig}`);
    console.log("");
    console.log("Add this to your .env:");
    console.log(`RANGER_VAULT_ADDRESS=${vaultKeypair.publicKey.toBase58()}`);
}

main().catch((err) => {
    console.error("[setup-vault] Failed:", err);
    process.exit(1);
});
