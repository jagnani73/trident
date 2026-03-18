import * as yup from "yup";
import { queryInteger } from "../../../utils/shared.schema";

export const listBotEventsQuery = yup.object().shape({
    page: queryInteger(1).required(),
    limit: queryInteger(1).required(),
    event_type: yup.string().oneOf([
        "tick", "open_position", "close_position",
        "rebalance", "emergency_exit", "error",
    ]).optional(),
}).required();

export type ListBotEventsQuery = yup.InferType<typeof listBotEventsQuery>;
