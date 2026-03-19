import { vaultRouter } from "./vault/vault.routes";
import { metricsRouter } from "./metrics/metrics.routes";
import { botRouter } from "./bot/bot.routes";
import { DatabaseService } from "../../services/database.service";
import { DriftService } from "../../services/drift.service";
import { JobsService } from "../../services/jobs.service";
import { LoggerService } from "../../services/logger.service";
import { CORS_CONFIG } from "../../utils/constants";
import { type AppError, convertToAppError, ErrorScope } from "@trident/common/errors";
import cors from "cors";
import "dotenv/config";
import type { Express, NextFunction, Request, Response } from "express";
import express, { Router } from "express";
import { createServer } from "node:http";

const app: Express = express();
const server = createServer(app);

const logger = LoggerService.scoped("server");

app.use(cors(CORS_CONFIG()));
app.use(express.json());

app.get("/healthcheck", (_req: Request, res: Response) => {
    const log = logger.scoped("healthcheck");
    const now = new Date();
    log.info("healthcheck", {
        timestamp: now.toISOString(),
        uptime: process.uptime(),
    });
    res.json({
        success: true,
        timestamp: now.toISOString(),
        uptime: process.uptime(),
    });
});

const v1Router = Router();
app.use("/api/v1", v1Router);

v1Router.use("/vault", vaultRouter);
v1Router.use("/metrics", metricsRouter);
v1Router.use("/bot", botRouter);

app.use("/*splat", (_req: Request, res: Response) => {
    const log = logger.scoped("not-found");
    log.info("not-found", { path: _req.path });
    res.status(404).json({
        success: false,
        message: "Not Found",
    });
});

app.use((error: Error | unknown, _req: Request, res: Response, _next: NextFunction) => {
    const appError: AppError = convertToAppError(error, ErrorScope.HTTP);
    const log = LoggerService.scoped("http:error");
    log.error("unhandled-error", { error: appError.toLog() });

    res.status(appError.code).json({
        success: false,
        data: appError.toPublic(),
    });
});

(async () => {
    const log = logger.scoped("init");
    try {
        await DatabaseService.init();

        const env: string = process.env.NODE_ENV || "development";
        const port: number = +(process.env.PORT || 8000);
        server.listen(port, () => {
            log.info("listening", { port, env });
        });

        // Jobs handles Drift init + warmup + tick loop (runs after server is up)
        await JobsService.start();
    } catch (error) {
        log.error("fatal-startup-error", { error });
        process.exit(1);
    }
})();

async function shutdown() {
    const log = logger.scoped("shutdown");
    log.info("shutting-down");
    JobsService.stop();
    await DriftService.shutdown();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);

export default app;
