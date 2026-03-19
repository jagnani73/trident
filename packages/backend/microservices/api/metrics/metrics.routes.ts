import type { Router as RouterType } from "express";
import { Router } from "express";

import { apiHandler, parsePagination, parseTimeRange } from "../utils";
import { getFundingRates, getSpreadMetrics } from "./metrics.service";

export const metricsRouter: RouterType = Router();

metricsRouter.get(
    "/funding",
    apiHandler(async (req) => {
        const live = req.query.live !== "false";
        const marketIndex =
            req.query.market_index !== undefined
                ? Number(req.query.market_index)
                : undefined;
        const timeRange = parseTimeRange(req);
        const pagination = parsePagination(req);
        return getFundingRates({ live, marketIndex }, timeRange, pagination);
    }),
);

metricsRouter.get(
    "/spreads",
    apiHandler(async (req) => {
        const live = req.query.live !== "false";
        const pair = req.query.pair as string | undefined;
        const timeRange = parseTimeRange(req);
        const pagination = parsePagination(req);
        return getSpreadMetrics({ live, pair }, timeRange, pagination);
    }),
);
