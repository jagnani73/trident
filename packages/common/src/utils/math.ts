/** Arithmetic mean. Returns 0 for empty input. */
export function mean(values: number[]): number {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
}

/** Population standard deviation. Returns 0 for fewer than 2 values. */
export function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const m = mean(values);
    let sumSq = 0;
    for (const v of values) sumSq += (v - m) ** 2;
    return Math.sqrt(sumSq / values.length);
}

/**
 * Z-score of `value` relative to the population described by `values`.
 * Returns null if std dev is 0 or insufficient data (< 2 values).
 */
export function zScore(value: number, values: number[]): number | null {
    const sd = stdDev(values);
    if (sd === 0) return null;
    return (value - mean(values)) / sd;
}
