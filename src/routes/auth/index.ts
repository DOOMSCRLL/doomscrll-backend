import { FastifyPluginAsync } from "fastify"
import { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"

import { AuthController } from "../../controllers/auth.controller.js"

const authRoutes: FastifyPluginAsync = async (fastify) => {
	const typedFastify = fastify.withTypeProvider<ZodTypeProvider>()

	typedFastify.post(
		"/request",
		{
			config: {
				rateLimit: {
					max: 5,
					timeWindow: "15 minutes",
				},
			},
			schema: {
				body: z.object({
					email: z.email("Please provide a valid email address"),
				}),
			},
		},
		AuthController.requestOtp,
	)

	typedFastify.post(
		"/verify",
		{
			config: {
				rateLimit: {
					max: 10,
					timeWindow: "15 minutes",
				},
			},
			schema: {
				body: z.object({
					email: z.email("Invalid email format"),
					code: z.string().length(6, "Code must be exactly 6 digits."),
				}),
			},
		},
		AuthController.verifyOtp,
	)

	typedFastify.get("/csrf", { preValidation: [fastify.authenticate] }, AuthController.getCsrfToken)

	typedFastify.post("/logout", { preValidation: [fastify.authenticate, fastify.csrfProtection] }, AuthController.logout)
}

export default authRoutes
