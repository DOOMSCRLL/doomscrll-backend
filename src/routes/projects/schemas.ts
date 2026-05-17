import { z } from "zod"

import { DB_RULES } from "../../config/index.js"

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
	tags: z.array(z.string()).max(DB_RULES.limitTags).optional(),
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
	tags: z.array(z.string()).min(1).max(DB_RULES.limitTags, `Maximum of ${DB_RULES.limitTags} tags allowed`),
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
