import {
    bot_event_type,
    close_reason,
    position_status,
    position_type,
    strategy_layer,
} from "./schema";

export const botEventTypeValues = [...bot_event_type.enumValues] as const;
export const closeReasonValues = [...close_reason.enumValues] as const;
export const positionStatusValues = [...position_status.enumValues] as const;
export const positionTypeValues = [...position_type.enumValues] as const;
export const strategyLayerValues = [...strategy_layer.enumValues] as const;
