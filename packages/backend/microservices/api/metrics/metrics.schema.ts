import * as yup from "yup";

export const getFundingQuery = yup.object().shape({
    market_index: yup.string().optional(),
}).required();

export type GetFundingQuery = yup.InferType<typeof getFundingQuery>;
