import { execSync } from "child_process";
import "dotenv/config";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { extname, resolve } from "path";
import { format } from "prettier";
import drizzleConfig from "../drizzle.config";

/**
 * Recursively collect files under a directory
 */
function getAllFiles(dir: string): string[] {
    const entries = readdirSync(dir);
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = resolve(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...getAllFiles(fullPath));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * Determine Prettier parser based on file extension
 */
function getParser(filePath: string) {
    switch (extname(filePath)) {
        case ".ts":
            return "typescript";
        case ".json":
            return "json";
        default:
            return null;
    }
}

(async () => {
    try {
        // 1. Run drizzle pull
        execSync("npx drizzle-kit pull", {
            stdio: "inherit",
        });

        // 2. Load Prettier config (monorepo-safe)
        const prettierConfig = JSON.parse(
            readFileSync(resolve(process.cwd(), "..", "..", ".prettierrc"), "utf-8"),
        );

        // 3. Collect all generated files
        const drizzleDir = resolve(process.cwd(), drizzleConfig.out!);

        const files = getAllFiles(drizzleDir);

        // 4. Prettify supported files
        for (const file of files) {
            const parser = getParser(file);
            if (!parser) continue;

            const content = readFileSync(file, "utf-8");

            const formatted = await format(content, {
                ...prettierConfig,
                parser,
            });

            writeFileSync(file, formatted);
        }

        console.log("Drizzle schema pulled and prettified successfully.");
    } catch (error) {
        console.error("Error running drizzle pull:", error);
        process.exit(1);
    }
})();
