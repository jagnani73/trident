export enum ErrorScope {
    HTTP = "http",
    DATABASE = "database",
    AUTHENTICATION = "authentication",
    AUTHORIZATION = "authorization",
    VALIDATION = "validation",
    INTERNAL = "internal",
    UNKNOWN = "unknown",
}

export enum HttpCode {
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    INTERNAL_SERVER_ERROR = 500,
}

export interface AppErrorOptions {
    scope: ErrorScope;
    code: HttpCode | number;
    message: string;
    log?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
    cause?: Error;
}

export interface AppErrorPublic {
    scope: ErrorScope;
    code: HttpCode | number;
    name: string;
    message: string;
    details?: Record<string, unknown>;
    retryable: boolean;
    timestamp: string;
}

const getHttpCodeName = (code: number): string => {
    switch (code) {
        case 400:
            return "BAD_REQUEST";
        case 401:
            return "UNAUTHORIZED";
        case 403:
            return "FORBIDDEN";
        case 404:
            return "NOT_FOUND";
        case 409:
            return "CONFLICT";
        case 500:
            return "INTERNAL_SERVER_ERROR";
        default:
            return "UNKNOWN_ERROR";
    }
};

export const convertToAppError = (error: unknown, scope: ErrorScope = ErrorScope.HTTP) => {
    if (error instanceof AppError) {
        return error;
    }

    const errorObj = error as Record<string, unknown>;
    const _code = errorObj.errorCode || errorObj.error_code || errorObj.code;
    const httpStatus = typeof _code === "number" && !isNaN(_code) ? _code : 500;
    const message =
        String(errorObj.reason) ||
        String(errorObj.error_message) ||
        (error as Error)?.message ||
        "Internal Server Error";

    return new AppError({
        scope, // Use the passed scope parameter
        code: httpStatus,
        message,
        log: (error as Error)?.stack || String(error),
        cause: error instanceof Error ? error : undefined,
    });
};

export class AppError extends Error {
    public readonly scope: ErrorScope;
    public readonly code: HttpCode | number;
    public readonly name: string;
    public readonly log?: string;
    public readonly details?: Record<string, unknown>;
    public readonly retryable: boolean;
    public readonly timestamp: string;
    public readonly cause: Error | undefined;

    constructor(options: AppErrorOptions) {
        super(options.message);

        this.name = "AppError";
        this.scope = options.scope;
        this.code = options.code;
        this.name = getHttpCodeName(options.code);
        this.log = options.log;
        this.details = options.details;
        this.retryable = options.retryable || false;
        this.timestamp = new Date().toISOString();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }

        if (options.cause) {
            this.cause = options.cause;
        }
    }

    /**
     * Convert to public-safe object for client consumption
     */
    toPublic(): AppErrorPublic {
        return {
            scope: this.scope,
            code: this.code,
            name: this.name,
            message: this.message,
            details: this.details,
            retryable: this.retryable,
            timestamp: this.timestamp,
        };
    }

    /**
     * Convert to full object for logging (includes stack trace)
     */
    toLog() {
        return {
            ...this.toPublic(),
            stack: this.stack,
            cause: this.cause,
            log: this.log,
        };
    }
}
