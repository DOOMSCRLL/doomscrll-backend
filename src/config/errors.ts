export const ERROR_MAP = {
	INTERNAL_ERROR: {
		code: "INTERNAL_ERROR",
		message: "An internal server error occurred.",
	},
	NOT_FOUND: {
		code: "NOT_FOUND",
		message: "The requested resource was not found.",
	},
	UNAUTHORIZED: {
		code: "UNAUTHORIZED",
		message: "You are not authorized to perform this action.",
	},
	INVALID_PAYLOAD: {
		code: "INVALID_PAYLOAD",
		message: "The provided payload is invalid.",
	},
	DEADZONE_ACTIVE: {
		code: "DEADZONE_ACTIVE",
		message: "DOOMLIT reservations for the next day closes at 23:00. Deadzone is active.",
	},
	SLOT_UNAVAILABLE: {
		code: "SLOT_UNAVAILABLE",
		message: "All DOOMLIT slots have been reserved for this date.",
	},
	COOLDOWN_ACTIVE: {
		code: "COOLDOWN_ACTIVE",
		message: "A project cannot be re-showcased before 14 days since its last showcase date.",
	},
	DRAFT_LIMIT_REACHED: {
		code: "DRAFT_LIMIT_REACHED",
		message: "You already have an active draft. Please complete or cancel it before starting a new one.",
	},
	INVALID_STATE: {
		code: "INVALID_STATE",
		message: "The project is not in a valid state for this action.",
	},
	VALIDATION_FAILED: {
		code: "VALIDATION_FAILED",
		message: "Missing or invalid required fields.",
	},
	INVALID_DATE: {
		code: "INVALID_DATE",
		message: "Queried date must be in the future.",
	},
	SESSION_EXPIRED: {
		code: "SESSION_EXPIRED",
		message: "Session expired or invalid.",
	},
	INVALID_OTP: {
		code: "INVALID_OTP",
		message: "Invalid or expired code.",
	},
	USERNAME_TAKEN: {
		code: "USERNAME_TAKEN",
		message: "That username is already taken.",
	},
	INVALID_SIGNATURE: {
		code: "INVALID_SIGNATURE",
		message: "Invalid webhook signature.",
	},
	MALFORMED_JSON: {
		code: "MALFORMED_JSON",
		message: "Malformed JSON body.",
	},
	MISSING_REFERENCE_ID: {
		code: "MISSING_REFERENCE_ID",
		message: "Missing project reference ID in payload.",
	},
} as const

export type ErrorCode = keyof typeof ERROR_MAP

export function getErrorResponse(code: ErrorCode, details?: any, customMessage?: string) {
	return {
		success: false as const,
		error: {
			code: ERROR_MAP[code].code,
			message: customMessage || ERROR_MAP[code].message,
			details,
		},
	}
}
