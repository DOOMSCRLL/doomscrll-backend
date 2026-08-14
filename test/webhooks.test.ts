import { describe, it, expect, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import webhookRoutes from "../src/routes/webhooks/index.js"
import { WebhooksService } from "../src/services/webhooks.service.js"

vi.mock("../src/services/webhooks.service.js", () => {
	return {
		WebhooksService: {
			processPaymentWebhook: vi.fn(),
		},
	}
})

describe("Webhook Routes", () => {
	let fastify: ReturnType<typeof Fastify>

	beforeEach(async () => {
		vi.clearAllMocks()
		fastify = Fastify()
		process.env.WEBHOOK_SECRET = "test-secret"
		await fastify.register(webhookRoutes, { prefix: "/webhooks" })
		await fastify.ready()
	})

	it("should handle payment webhook successfully", async () => {
		vi.mocked(WebhooksService.processPaymentWebhook).mockResolvedValue({
			success: true,
			projectReferenceId: "ref123",
		} as any)

		const response = await fastify.inject({
			method: "POST",
			url: "/webhooks/payment",
			headers: {
				"webhook-signature": "test-signature",
			},
			payload: { projectReferenceId: "ref123" },
		})

		expect(response.statusCode).toBe(200)
		expect(WebhooksService.processPaymentWebhook).toHaveBeenCalled()
	})

	it("should return 401 on invalid signature", async () => {
		vi.mocked(WebhooksService.processPaymentWebhook).mockResolvedValue({ error: "INVALID_SIGNATURE" } as any)

		const response = await fastify.inject({
			method: "POST",
			url: "/webhooks/payment",
			headers: {
				"webhook-signature": "bad-signature",
			},
			payload: { projectReferenceId: "ref123" },
		})

		expect(response.statusCode).toBe(401)
	})

	it("should return 400 on malformed json payload", async () => {
		vi.mocked(WebhooksService.processPaymentWebhook).mockResolvedValue({
			error: "MALFORMED_JSON",
			message: "Bad JSON",
		} as any)

		const response = await fastify.inject({
			method: "POST",
			url: "/webhooks/payment",
			headers: { "webhook-signature": "test-signature" },
			payload: { projectReferenceId: "ref123" },
		})

		expect(response.statusCode).toBe(400)
		expect(response.json().error.code).toBe("MALFORMED_JSON")
	})

	it("should return 400 when missing reference ID", async () => {
		vi.mocked(WebhooksService.processPaymentWebhook).mockResolvedValue({ error: "MISSING_REFERENCE_ID" } as any)

		const response = await fastify.inject({
			method: "POST",
			url: "/webhooks/payment",
			headers: { "webhook-signature": "test-signature" },
			payload: {},
		})

		expect(response.statusCode).toBe(400)
		expect(response.json().error.code).toBe("MISSING_REFERENCE_ID")
	})
})
