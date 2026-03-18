export interface ResponseWithData<T> {
    success: boolean;
    data: T;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
}
