const BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export async function fetchApi<T>(
    path: string,
    params?: Record<string, string | undefined>,
): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);

    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) url.searchParams.set(key, value);
        }
    }

    const res = await fetch(url.toString());
    const json = await res.json();

    if (!json.success) {
        throw new Error(json.data?.message || "API request failed");
    }

    return json.data as T;
}
