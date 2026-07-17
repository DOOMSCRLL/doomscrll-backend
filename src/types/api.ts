export type ApiErrorCode =
	| "INVALID_PAYLOAD"
	| "SLOT_UNAVAILABLE"
	| "DEADZONE_ACTIVE"
	| "MONTHLY_LIMIT_REACHED"
	| "COOLDOWN_ACTIVE"
	| "INTERNAL_ERROR"

export interface ApiError<T> {
	code: ApiErrorCode
	message: string
	details?: Record<string, T>
}

export type ApiResponse<T = void> = 
	| { success: true; data: T; message?: string } 
	| { success: false; error: ApiError<T> }
