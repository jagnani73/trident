type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = unknown;

type LogColors = {
    debug: string;
    info: string;
    warn: string;
    error: string;
    reset: string;
};

export type ScopedLogger = {
    debug: (message: string, meta?: LogMeta) => void;
    info: (message: string, meta?: LogMeta) => void;
    warn: (message: string, meta?: LogMeta) => void;
    error: (message: string, meta?: LogMeta) => void;
    scoped: (childScope: string, meta?: LogMeta) => ScopedLogger;
};

export class LoggerService {
    private static colors: LogColors = {
        debug: "\x1b[36m",
        info: "\x1b[32m",
        warn: "\x1b[33m",
        error: "\x1b[31m",
        reset: "\x1b[0m",
    };

    private static jsonReplacer(_key: string, value: unknown): unknown {
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                ...(value.stack ? { stack: value.stack } : {}),
                ...Object.fromEntries(Object.entries(value)),
            };
        }
        return value;
    }

    private static isColorEnabled(): boolean {
        return process.env.NODE_ENV !== "production";
    }

    private static isLogLevelEnabled(level: LogLevel): boolean {
        const envLevels = process.env.LOG_LEVEL;
        if (!envLevels) return true;

        const enabledLevels = envLevels
            .toLowerCase()
            .split(",")
            .map((l) => l.trim());
        return enabledLevels.includes(level);
    }

    private static write(
        level: LogLevel,
        scope: string | undefined,
        message: string,
        meta?: LogMeta,
    ): void {
        if (!this.isLogLevelEnabled(level)) return;

        const ts = new Date().toISOString();
        const levelStr = level.toUpperCase();
        const scopeStr = scope ? ` (${scope})` : "";

        const colorEnabled = this.isColorEnabled();
        const color = colorEnabled ? this.colors[level] : "";
        const reset = colorEnabled ? this.colors.reset : "";

        const line = `${color}${levelStr} [${ts}]${scopeStr} -> ${message}${reset}`;
        const output =
            meta !== undefined
                ? `${line} ${JSON.stringify(meta, this.jsonReplacer)}\n`
                : `${line}\n`;
        const stream =
            level === "warn" || level === "error"
                ? process.stderr
                : process.stdout;
        stream.write(output);
    }

    private static mergeMeta(
        defaultMeta: LogMeta | undefined,
        meta: LogMeta | undefined,
    ): LogMeta | undefined {
        if (meta === undefined) return defaultMeta;
        if (defaultMeta === undefined) return meta;

        if (
            typeof defaultMeta === "object" &&
            defaultMeta !== null &&
            typeof meta === "object" &&
            meta !== null &&
            !Array.isArray(defaultMeta) &&
            !Array.isArray(meta)
        ) {
            return { ...defaultMeta, ...meta };
        }

        return meta;
    }

    public static scoped(scope: string, defaultMeta?: LogMeta): ScopedLogger {
        const write = (level: LogLevel, message: string, meta?: LogMeta) =>
            LoggerService.write(
                level,
                scope,
                message,
                LoggerService.mergeMeta(defaultMeta, meta),
            );

        const scoped = (childScope: string, meta?: LogMeta): ScopedLogger => {
            const combinedScope = `${scope}::${childScope}`;
            const mergedMeta = LoggerService.mergeMeta(defaultMeta, meta);
            return LoggerService.scoped(combinedScope, mergedMeta);
        };

        return {
            debug: (message: string, meta?: LogMeta) =>
                write("debug", message, meta),
            info: (message: string, meta?: LogMeta) =>
                write("info", message, meta),
            warn: (message: string, meta?: LogMeta) =>
                write("warn", message, meta),
            error: (message: string, meta?: LogMeta) =>
                write("error", message, meta),
            scoped,
        };
    }

    public static debug(message: string, meta?: LogMeta): void {
        this.write("debug", undefined, message, meta);
    }
    public static info(message: string, meta?: LogMeta): void {
        this.write("info", undefined, message, meta);
    }
    public static warn(message: string, meta?: LogMeta): void {
        this.write("warn", undefined, message, meta);
    }
    public static error(message: string, meta?: LogMeta): void {
        this.write("error", undefined, message, meta);
    }
}
