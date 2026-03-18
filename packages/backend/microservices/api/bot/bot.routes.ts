import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

export const botRouter: RouterType = Router();

botRouter.get("/status", async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "TODO: bot status" } });
});

botRouter.get("/events", async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "TODO: bot events" } });
});
