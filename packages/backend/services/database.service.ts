import "dotenv/config";
import type { drizzle } from "drizzle-orm/postgres-js";
import { LoggerService } from "./logger.service";

const logger = LoggerService.scoped("database");

export class DatabaseService {
    private static initialized = false;
    private static db: ReturnType<typeof drizzle> | null = null;

    static getDb(): ReturnType<typeof drizzle> {
        if (!this.db) throw new Error("DatabaseService not initialized — call init() first");
        return this.db;
    }

    static async init(): Promise<void> {
        if (this.initialized) return;

        const log = logger.scoped("init");

        const url = process.env.DATABASE_URL;
        if (!url) {
            log.warn("no-database-url", {
                message: "DATABASE_URL not set, running without database",
            });
            return;
        }

        try {
            // Dynamic import to avoid requiring postgres when no DB is configured
            const { default: postgres } = await import("postgres");
            const { drizzle } = await import("drizzle-orm/postgres-js");

            const client = postgres(url);
            this.db = drizzle(client);

            this.initialized = true;
            log.info("connected");
        } catch (error) {
            log.error("connection-failed", { error });
            throw error;
        }
    }
}
