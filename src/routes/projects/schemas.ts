import { z } from "zod"

import { DB_RULES } from "../../config/index.js"

const tagRule = z
	.string()
	.startsWith("#", "Tag must start with a `#` character.")
	.regex(/^#[a-z0-9-]+$/, "Tag must be lower case, and hypen-delimited (i.e, #deck-builder).")

export const apiErrorResponseSchema = z.object({
	success: z.literal(false),
	error: z.object({
		code: z.string(),
		message: z.string(),
		details: z.record(z.string(), z.any()).optional(),
	}),
})

// #region Creator-related private requests
export const reserveProjectSchema = z.object({
	name: z
		.string()
		.min(3, "Name is required")
		.max(DB_RULES.maxLengthProjectTitle, `Name cannot exceed ${DB_RULES.maxLengthProjectTitle} characters`),
	category: z.string().min(1, "Category is required"),
	primaryPlatform: z.string().min(1, "Primary platform is required"),
	primaryUrl: z.url("Must be a valid URL"),
	showcaseDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be strictly YYYY-MM-DD to prevent timezone shifting"),
})

export const patchContentSchema = z.object({
	description: z.string().max(DB_RULES.maxLengthProjectDescription).optional(),
	tags: z.array(tagRule).max(DB_RULES.limitTags).optional(),
	features: z.array(z.string()).optional(),
	coverImagePath: z.string().startsWith("projects/").endsWith(".webp").optional(),
	screenshotPaths: z
		.array(z.string().startsWith("projects/").endsWith(".webp"))
		.max(DB_RULES.limitScreenshots)
		.optional(),
	secondaryPlatforms: z
		.array(
			z.object({
				platform: z.string(),
				url: z.url(),
			}),
		)
		.optional(),
	videoUrl: z.url().optional(),
})

export const publishContentSchema = z.object({
	description: z
		.string()
		.min(16, "Description must be at least 16 characters")
		.max(
			DB_RULES.maxLengthProjectDescription,
			`Description cannot exceet ${DB_RULES.maxLengthProjectDescription} characters`,
		),
	tags: z.array(tagRule).min(1).max(DB_RULES.limitTags, `Maximum of ${DB_RULES.limitTags} tags allowed`),
	coverImagePath: z.string().startsWith("projects/").endsWith(".wepb", "Cover image must be a WebP file."),
	features: z.array(z.string()).optional(),
	screenshotPaths: z
		.array(z.string().startsWith("projects/").endsWith(".webp"))
		.max(DB_RULES.limitScreenshots)
		.optional(),
	secondaryPlatforms: z
		.array(
			z.object({
				platform: z.string(),
				url: z.url(),
			}),
		)
		.optional(),
	videoUrl: z.url().optional(),
})

export type ReserveProjectPayload = z.infer<typeof reserveProjectSchema>
export type PatchContentPayload = z.infer<typeof patchContentSchema>
// #endregion

// #region Audience-related public requests
export const getProjectFeedQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	batchSize: z.coerce.number().int().min(1).max(16).default(8),
	category: z.string().optional(),
	platform: z.string().optional(),
	tag: tagRule.optional(),
})

export const getSingleProjectParamsSchema = z.object({
	referenceId: z.string().length(DB_RULES.finalReferenceIdLength, "Invalid DOOMLIT refrence ID format."),
})

export type GetProjectFeedQuery = z.infer<typeof getProjectFeedQuerySchema>
export type GetSingleProjectParams = z.infer<typeof getSingleProjectParamsSchema>

export const getProjectPreviewQuerySchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be strictly YYYY-MM-DD to prevent timezone shifting"),
	category: z.string(),
})
export type GetProjectPreviewQuery = z.infer<typeof getProjectPreviewQuerySchema>

export const projectPreviewSchema = z.object({
	name: z.string(),
	category: z.string(),
	tags: z.array(z.string()).nullable(),
	authorUsername: z.string(),
})

export const getProjectPreviewResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(projectPreviewSchema),
})

export const getDraftResponseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		referenceId: z.string(),
		name: z.string(),
		status: z.string(),
		showcaseDate: z.string(),
		reservedAt: z.string(),
	}),
})

export const getReservationCountsQuerySchema = z.object({
	year: z.coerce.number().int().min(2026).optional(),
	month: z.coerce.number().int().min(1).max(12).optional(),
})

export const getReservationCountsResponseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		meta: z.object({
			year: z.number().int(),
			month: z.number().int(),
			maxReservationsPerDay: z.number().int(),
		}),
		counts: z.record(z.string(), z.number().int()),
	}),
})
export type GetReservationCountsQuery = z.infer<typeof getReservationCountsQuerySchema>

export const getProjectRulesResponseSchema = z.object({
	success: z.literal(true),
	data: z.object({
		maxReservationsPerDay: z.number().int(),
		reservationWindowDays: z.number().int(),
		cooldownPeriodDays: z.number().int(),
		draftExpirationMinutes: z.number().int(),
		deadzoneWindow: z.object({
			start: z.string(),
			end: z.string(),
			timezone: z.literal("UTC"),
		}),
	}),
})
export type GetProjectRulesResponse = z.infer<typeof getProjectRulesResponseSchema>
// #endregion
