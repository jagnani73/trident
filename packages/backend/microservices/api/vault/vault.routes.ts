import type { Router as RouterType } from "express";
import { Router } from "express";

import { apiHandler, parsePagination, parseTimeRange } from "../utils";
import { getPositions, getVaultHistory, getVaultState } from "./vault.service";

export const vaultRouter: RouterType = Router();

vaultRouter.get(
    "/state",
    apiHandler(async () => {
        return getVaultState();
    }),
);

vaultRouter.get(
    "/positions",
    apiHandler(async (req) => {
        const status = req.query.status as "open" | "closed" | undefined;
        const type = req.query.type as "spread" | "basis" | undefined;
        const pagination = parsePagination(req);
        return getPositions({ status, type }, pagination);
    }),
);

vaultRouter.get(
    "/history",
    apiHandler(async (req) => {
        const timeRange = parseTimeRange(req);
        const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
        return getVaultHistory(timeRange, limit);
    }),
);
