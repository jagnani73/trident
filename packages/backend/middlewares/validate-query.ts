/* eslint-disable @typescript-eslint/no-explicit-any */
import { type NextFunction, type Request, type Response } from "express";
import { type ObjectSchema, type ValidationError as _ValidationError } from "yup";

type RequestLocations = "query" | "body" | "params" | "headers";

export const validateQuery = (location: RequestLocations, schema: ObjectSchema<any>) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let _location;
        switch (location) {
            case "query":
                _location = req.query;
                break;
            case "body":
                _location = req.body;
                break;
            case "params":
                _location = req.params;
                break;
            case "headers":
                _location = req.headers;
                break;
        }
        try {
            await schema.validate(_location, {
                abortEarly: false,
                stripUnknown: true,
            });
            next();
        } catch (error: Error | _ValidationError | any) {
            let message: string = "";
            error.errors.forEach((e: string) => {
                message += `${e}. `;
            });
            res.status(400).json({
                success: false,
                message: message.trim(),
            });
        }
    };
};

export default validateQuery;
