export type ApiErrorCode =
	| "INVALID_PAYLOAD"
	| "SLOT_UNAVAILABLE"
	| "DEADZONE_ACTIVE"
	| "MONTHLY_LIMIT_REACHED"
	| "COOLDOWN_ACTIVE"

export interface ApiError<T> {
	code: ApiErrorCode
	message: string
	details?: Record<string, T>
}

export type ApiResponse<T = void> = { success: true; data: T } | { success: false; error: ApiError<T> }
