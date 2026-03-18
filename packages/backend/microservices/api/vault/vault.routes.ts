import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

export const vaultRouter: RouterType = Router();

vaultRouter.get("/state", async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "TODO: vault state" } });
});

vaultRouter.get("/positions", async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "TODO: vault positions" } });
});

vaultRouter.get("/history", async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "TODO: vault history" } });
});
