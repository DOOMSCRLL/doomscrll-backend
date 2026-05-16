export const DB_RULES = {
	limitDailySlots: 256,
	limitMonthlyProjectsPerAccount: 2,
	durationProjectCooldown: 14, // days

	limitReservationWindow: 30, // days

	timeUTCServerReset: "00:00",
	bufferReservationDeadzone: 1, // hours

	durationPaymentTimeout: 15, // mins

	prefixProjectRefId: "P-",
	lengthProjectRefId: 10, // bytes, a NanoID

	maxLengthProjectTitle: 128,
	maxLengthProjectDescription: 256,
	limitTags: 5,
	limitScreenshots: 8,

	maxSizeUploadedImage: 5, // mb
} as const
