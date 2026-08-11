export const ERROR_MAP = {
	INTERNAL_ERROR: "An internal server error occurred.",
	NOT_FOUND: "The requested resource was not found.",
	UNAUTHORIZED: "You are not authorized to perform this action.",
	INVALID_PAYLOAD: "The provided payload is invalid.",
	DEADZONE_ACTIVE: "DOOMLIT reservations for the next day closes at 23:00. Deadzone is active.",
	SLOT_UNAVAILABLE: "All DOOMLIT slots have been reserved for this date.",
	COOLDOWN_ACTIVE: "A project cannot be re-showcased before 14 days since its last showcase date.",
	DRAFT_LIMIT_REACHED: "You already have an active draft. Please complete or cancel it before starting a new one.",
	INVALID_STATE: "The project is not in a valid state for this action.",
	VALIDATION_FAILED: "Missing or invalid required fields.",
	INVALID_DATE: "Queried date must be in the future.",
	SESSION_EXPIRED: "Session expired or invalid.",
	INVALID_OTP: "Invalid or expired code.",
	USERNAME_TAKEN: "That username is already taken.",
	INVALID_SIGNATURE: "Invalid webhook signature.",
	MALFORMED_JSON: "Malformed JSON body.",
	MISSING_REFERENCE_ID: "Missing project reference ID in payload.",
	INVALID_URL: "The provided URL does not exist or the product is not published yet.",
	OFFER_EXPIRED: "Free launch week offer has expired. Payment is required.",
} as const

export type ErrorCode = keyof typeof ERROR_MAP

export function getErrorResponse(code: ErrorCode, details?: any, customMessage?: string) {
	return {
		success: false as const,
		error: {
			code,
			message: customMessage || ERROR_MAP[code],
			details,
		},
	}
}
