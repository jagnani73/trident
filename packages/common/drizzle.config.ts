import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
    out: "./src/database",
    casing: "snake_case",
    introspect: {
        casing: "preserve",
    },
});
