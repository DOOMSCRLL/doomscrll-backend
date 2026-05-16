import { z } from "zod"

import { DB_RULES } from "../../config/index.js"

export const reserveProjectSchema = z.object({
	name: z
		.string()
		.min(3, "Name is required")
		.max(DB_RULES.maxLengthProjectTitle, `Name cannot exceed ${DB_RULES.maxLengthProjectTitle} characters`),
	category: z.string().min(1, "Category is required"),
	primaryPlatform: z.string().min(1, "Primary platform is required"),
	primaryUrl: z.string().url("Must be a valid URL"),
	showcaseDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be strictly YYYY-MM-DD to prevent timezone shifting"),
})

export type ReserveProjectPayload = z.infer<typeof reserveProjectSchema>
