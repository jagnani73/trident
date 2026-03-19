"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "@/lib/api";

interface UseApiResult<T> {
    data: T | null;
    error: string | null;
    loading: boolean;
    refetch: () => void;
}

export function useApi<T>(
    path: string,
    params?: Record<string, string | undefined>,
    intervalMs = 15_000,
): UseApiResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const paramsRef = useRef(params);
    paramsRef.current = params;

    const doFetch = useCallback(async () => {
        try {
            const result = await fetchApi<T>(path, paramsRef.current);
            setData(result);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [path]);

    useEffect(() => {
        setLoading(true);
        doFetch();
        if (intervalMs <= 0) return;
        const id = setInterval(doFetch, intervalMs);
        return () => clearInterval(id);
    }, [doFetch, intervalMs]);

    return { data, error, loading, refetch: doFetch };
}
