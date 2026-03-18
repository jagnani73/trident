import * as yup from "yup";
import { queryInteger } from "../../../utils/shared.schema";

export const listPositionsQuery = yup.object().shape({
    page: queryInteger(1).required(),
    limit: queryInteger(1).required(),
    status: yup.string().oneOf(["open", "closed"]).optional(),
    type: yup.string().oneOf(["spread", "basis"]).optional(),
}).required();

export type ListPositionsQuery = yup.InferType<typeof listPositionsQuery>;
