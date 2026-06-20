import { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { ProfileController } from "../../controllers/profile.controller.js"

export const profileRoutes: FastifyPluginAsyncZod = async (fastify) => {
	// #region Public routes
	fastify.register(async (publicRoutes) => {
		publicRoutes.get(
			"/:username",
			{
				config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
				schema: {
					params: z.object({
						username: z.string().min(1, "User name is required."),
					}),
				},
			},
			ProfileController.getPublicProfile,
		)
	})
	// #endregion

	// #region Private routes
	fastify.register(async (privateRoutes) => {
		privateRoutes.addHook("preHandler", fastify.authenticate)
		privateRoutes.addHook("preHandler", (request, reply, done) => {
			if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
				fastify.csrfProtection(request, reply, done)
			} else {
				done()
			}
		})

		privateRoutes.get("/me", ProfileController.getMe)

		privateRoutes.patch(
			"/me",
			{
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
			ProfileController.updateMe,
		)

		privateRoutes.delete("/me", ProfileController.deleteMe)
	})
	// #endregion
}

export default profileRoutes
