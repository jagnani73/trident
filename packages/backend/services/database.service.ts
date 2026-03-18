import { LoggerService } from "./logger.service";
import "dotenv/config";

const logger = LoggerService.scoped("database");

export class DatabaseService {
    private static initialized = false;

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
            const _db = drizzle(client);

            this.initialized = true;
            log.info("connected");
        } catch (error) {
            log.error("connection-failed", { error });
            throw error;
        }
    }
}
