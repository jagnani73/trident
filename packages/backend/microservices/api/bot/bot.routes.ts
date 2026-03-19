import type { Router as RouterType } from "express";
import { Router } from "express";

import { apiHandler, parsePagination, parseTimeRange } from "../utils";
import { getBotEvents, getBotStatus } from "./bot.service";

export const botRouter: RouterType = Router();

botRouter.get(
    "/status",
    apiHandler(async () => {
        return getBotStatus();
    }),
);

botRouter.get(
    "/events",
    apiHandler(async (req) => {
        const eventType = req.query.event_type as string | undefined;
        const timeRange = parseTimeRange(req);
        const pagination = parsePagination(req);
        return getBotEvents({ eventType }, timeRange, pagination);
    }),
);
