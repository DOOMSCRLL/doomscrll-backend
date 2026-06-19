import { describe, it, expect, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import webhookRoutes from "../src/routes/webhooks/index.js"
import { WebhooksService } from "../src/services/webhooks.service.js"

vi.mock("../src/services/webhooks.service.js", () => {
	return {
		WebhooksService: {
			processLemonSqueezyWebhook: vi.fn(),
		},
	}
})

describe("Webhook Routes", () => {
	let fastify: ReturnType<typeof Fastify>

	beforeEach(async () => {
		vi.clearAllMocks()
		fastify = Fastify()
		process.env.LEMONSQUEEZY_WEBHOOK_API_KEY = "test-secret"
		await fastify.register(webhookRoutes, { prefix: "/webhooks" })
		await fastify.ready()
	})

	it("should handle Lemon Squeezy webhook successfully", async () => {
		vi.mocked(WebhooksService.processLemonSqueezyWebhook).mockResolvedValue({
			success: true,
			projectReferenceId: "ref123",
		} as any)

		const response = await fastify.inject({
			method: "POST",
			url: "/webhooks/lemonsqueezy",
			headers: {
				"x-signature": "test-signature",
			},
			payload: { meta: { event_name: "order_created" } },
		})

		expect(response.statusCode).toBe(200)
		expect(WebhooksService.processLemonSqueezyWebhook).toHaveBeenCalled()
	})

	it("should return 401 on invalid signature", async () => {
		vi.mocked(WebhooksService.processLemonSqueezyWebhook).mockResolvedValue({ error: "INVALID_SIGNATURE" } as any)

		const response = await fastify.inject({
			method: "POST",
			url: "/webhooks/lemonsqueezy",
			headers: {
				"x-signature": "bad-signature",
			},
			payload: { meta: { event_name: "order_created" } },
		})

		expect(response.statusCode).toBe(401)
	})
})
