import { FastifyPluginAsync } from "fastify"
import fastifyRawBody from "fastify-raw-body"
import { WebhooksController } from "../../controllers/webhooks.controller.js"

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
	await fastify.register(fastifyRawBody, {
		field: "rawBody",
		global: false,
		encoding: "utf8",
		runFirst: true,
	})

	fastify.post(
		"/lemonsqueezy",
		{
			config: { rawBody: true },
		},
		WebhooksController.handleLemonSqueezy,
	)
}

export default webhookRoutes
