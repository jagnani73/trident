import { LoggerService } from "../../../services/logger.service";

const logger = LoggerService.scoped("botService");

export const getBotStatus = async () => {
    const log = logger.scoped("getBotStatus");
    log.info("fetching-bot-status");
    // TODO: Implement
    return { running: false, lastTick: null };
};

export const getBotEvents = async () => {
    const log = logger.scoped("getBotEvents");
    log.info("fetching-bot-events");
    // TODO: Implement via DatabaseService
    return [];
};
