import { eq } from "drizzle-orm"
import { FastifyPluginAsync } from "fastify"
import { ZodTypeProvider } from "fastify-type-provider-zod"
import sanitizeHtml from "sanitize-html"
import { z } from "zod"

import { profiles } from "../../db/schema.js"

const profileRoutes: FastifyPluginAsync = async (fastify) => {
	const typedFastify = fastify.withTypeProvider<ZodTypeProvider>()

	// Private / Full profile request
	typedFastify.get(
		"/me",
		{
			preValidation: [fastify.authenticate],
		},
		async (request, reply) => {
			const userId = request.user.id
			const [profile] = await fastify.db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)

			if (!profile) return reply.code(404).send({ error: "Profile not found." })
			else reply.send({ success: true, profile: profile })
		},
	)

	// Public / Partial profile request
	typedFastify.get(
		"/:username",
		{
			schema: {
				params: z.object({
					username: z.string().min(1, "User name is required."),
				}),
			},
		},
		async (request, reply) => {
			const { username } = request.params

			const [publicProfile] = await fastify.db
				.select({
					username: profiles.username,
					description: profiles.description,
					url: profiles.url,
				})
				.from(profiles)
				.where(eq(profiles.username, username))
				.limit(1)

			if (!publicProfile) return reply.code(404).send({ error: "Creator not found." })
			else reply.send({ success: true, profile: publicProfile })
		},
	)

	typedFastify.patch(
		"/me",
		{
			preValidation: [fastify.authenticate],
			schema: {
				body: z.object({
					username: z
						.string()
						.min(3, "Username must be at least 3 characters.")
						.max(80, "Username cannot exceed 80 characters.")
						.regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, dashes and underscores.")
						.optional(),
					description: z.string().max(255, "Description is too long (max. 255 chars.)").optional(),
					url: z.string().url("Invalid URL format.").max(255).optional().or(z.literal("")),
				}),
			},
		},
		async (request, reply) => {
			const { username, description, url } = request.body

			const userId = request.user.id
			const updates: Partial<typeof profiles.$inferInsert> = {}

			if (username !== undefined) updates.username = username
			if (url !== undefined) updates.url = url
			if (description !== undefined) {
				updates.description = sanitizeHtml(description, {
					allowedTags: [],
					allowedAttributes: {},
				})
			}

			if (Object.keys(updates).length === 0) return reply.send({ success: true, message: "No changes provided" })

			try {
				const [updatedProfile] = await fastify.db
					.update(profiles)
					.set(updates)
					.where(eq(profiles.id, userId))
					.returning({
						username: profiles.username,
						description: profiles.description,
						url: profiles.url,
					})

				return reply.send({ success: true, profile: updatedProfile })
			} catch (error: unknown) {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					"constraint" in error &&
					error.code === "23505" &&
					error.constraint === "profiles_username_unique"
				) {
					return reply.code(409).send({ error: "That username is already taken." })
				}

				request.log.error(error)
				return reply.code(500).send({ error: "Internal Server Error" })
			}
		},
	)

	typedFastify.delete(
		"/me",
		{
			preValidation: [fastify.authenticate],
		},
		async (request, reply) => {
			const userId = request.user.id
			const deleted = await fastify.db.delete(profiles).where(eq(profiles.id, userId)).returning({ id: profiles.id })

			if (deleted.length === 0) return reply.code(404).send({ error: "Profile not found." })

			return reply
				.clearCookie("session_id", { path: "/" })
				.send({ success: true, message: "Account and all data deleted." })
		},
	)
}

export default profileRoutes
