import { convertToAppError, ErrorScope } from "@trident/common/errors";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { LoggerService } from "../../services/logger.service";

const logger = LoggerService.scoped("api-utils");

/**
 * Wraps an async route handler with try/catch and ResponseWithData format.
 */
export function apiHandler<T>(
    fn: (req: Request, res: Response) => Promise<T>,
): RequestHandler {
    return async (req: Request, res: Response, _next: NextFunction) => {
        try {
            const data = await fn(req, res);
            res.json({ success: true, data });
        } catch (error) {
            const appError = convertToAppError(error, ErrorScope.HTTP);
            logger.error("handler-error", { error: appError.toLog(), path: req.path });
            res.status(appError.code).json({ success: false, data: appError.toPublic() });
        }
    };
}

export interface PaginationParams {
    limit: number;
    offset: number;
}

export function parsePagination(req: Request): PaginationParams {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    return { limit, offset };
}

export interface TimeRangeParams {
    from: Date;
    to: Date;
}

export function parseTimeRange(req: Request): TimeRangeParams {
    const now = new Date();
    const to = req.query.to ? new Date(req.query.to as string) : now;
    const from = req.query.from
        ? new Date(req.query.from as string)
        : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return { from, to };
}

/**
 * Check if DriftService was successfully initialized.
 * The API server catches init failures, so the module may be loaded but not connected.
 */
export async function isDriftAvailable(): Promise<boolean> {
    try {
        const { DriftService } = await import("../../services/drift.service");
        DriftService.getClient();
        return true;
    } catch {
        return false;
    }
}
