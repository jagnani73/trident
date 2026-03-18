import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

export const metricsRouter: RouterType = Router();

metricsRouter.get("/funding", async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "TODO: funding rates" } });
});

metricsRouter.get("/spreads", async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "TODO: spread z-scores" } });
});
