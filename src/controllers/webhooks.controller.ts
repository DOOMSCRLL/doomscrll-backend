import { FastifyReply, FastifyRequest } from "fastify"
import { WebhooksService } from "../services/webhooks.service.js"
import { getErrorResponse } from "../config/errors.js"

export class WebhooksController {
	static async handleLemonSqueezy(request: FastifyRequest, reply: FastifyReply) {
		const secret = process.env.LEMONSQUEEZY_WEBHOOK_API_KEY
		const signature = request.headers["x-signature"] as string

		if (!secret || !signature || !request.rawBody) {
			return reply.code(400).send(getErrorResponse("INVALID_PAYLOAD", undefined, "Missing signature or raw body."))
		}

		try {
			const result = await WebhooksService.processLemonSqueezyWebhook(request.rawBody.toString(), signature, secret)

			if ("error" in result) {
				if (result.error === "INVALID_SIGNATURE") {
					request.log.warn("Invalid Lemon Squeezy signature detected.")
					return reply.code(401).send(getErrorResponse("INVALID_SIGNATURE"))
				} else if (result.error === "MALFORMED_JSON") {
					return reply.code(400).send(getErrorResponse("MALFORMED_JSON", undefined, result.message))
				} else if (result.error === "MISSING_REFERENCE_ID") {
					request.log.error("An order has been created without DOOMLIT reference ID.")
					return reply.code(400).send(getErrorResponse("MISSING_REFERENCE_ID"))
				}
			}

			if (result.success && "projectReferenceId" in result) {
				request.log.info(`Succesfullt processed payment for DOOMLIT ${result.projectReferenceId}`)
			}
			return reply.code(200).send("OK")
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Webhook processing failed."))
		}
	}
}
