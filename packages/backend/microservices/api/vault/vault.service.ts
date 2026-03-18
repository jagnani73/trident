import { LoggerService } from "../../../services";

const logger = LoggerService.scoped("vaultService");

export const getVaultState = async () => {
    const log = logger.scoped("getVaultState");
    log.info("fetching-vault-state");
    // TODO: Implement via Ranger Vault SDK
    return {};
};

export const getPositions = async () => {
    const log = logger.scoped("getPositions");
    log.info("fetching-positions");
    // TODO: Implement via DatabaseService
    return [];
};

export const getVaultHistory = async () => {
    const log = logger.scoped("getVaultHistory");
    log.info("fetching-history");
    // TODO: Implement via DatabaseService
    return [];
};
