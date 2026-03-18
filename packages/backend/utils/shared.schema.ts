import * as yup from "yup";

export const solanaWalletAddressSchema = yup
    .string()
    .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .trim();

const queryNumber = (integer: boolean, min?: number, max?: number) => {
    let schema = yup
        .string()
        .test(
            "is-number",
            integer
                ? "${path} must be a valid integer"
                : "${path} must be a valid number",
            (val) =>
                val === undefined ||
                (val !== "" &&
                    !Number.isNaN(Number(val)) &&
                    (!integer || Number.isInteger(Number(val)))),
        );
    if (min !== undefined) {
        const _min = min;
        schema = schema.test(
            "min",
            `\${path} must be at least ${_min}`,
            (val) => val === undefined || Number(val) >= _min,
        );
    }
    if (max !== undefined) {
        const _max = max;
        schema = schema.test(
            "max",
            `\${path} must be at most ${_max}`,
            (val) => val === undefined || Number(val) <= _max,
        );
    }
    return schema;
};

export const queryInteger = (min?: number, max?: number) =>
    queryNumber(true, min, max);

export const queryNumeric = (min?: number, max?: number) =>
    queryNumber(false, min, max);
