import { LoggerService } from "../../../services/logger.service";

const logger = LoggerService.scoped("metricsService");

export const getFundingRates = async () => {
    const log = logger.scoped("getFundingRates");
    log.info("fetching-funding-rates");
    // TODO: Implement via Drift SDK
    return [];
};

export const getSpreadMetrics = async () => {
    const log = logger.scoped("getSpreadMetrics");
    log.info("fetching-spread-metrics");
    // TODO: Implement via SpreadDetector service
    return [];
};
