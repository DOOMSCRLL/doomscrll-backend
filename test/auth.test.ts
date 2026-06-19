import { describe, it, expect, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import authRoutes from "../src/routes/auth/index.js"
import { AuthService } from "../src/services/auth.service.js"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import cookie from "@fastify/cookie"

// Mock the AuthService methods so we don't actually hit the DB or send emails
vi.mock("../src/services/auth.service.js", () => {
	return {
		AuthService: {
			requestOtp: vi.fn(),
			verifyOtp: vi.fn(),
			logout: vi.fn(),
		},
	}
})

describe("Auth Routes", () => {
	let fastify: ReturnType<typeof Fastify>

	beforeEach(async () => {
		vi.clearAllMocks()
		fastify = Fastify()
		fastify.setValidatorCompiler(validatorCompiler)
		fastify.setSerializerCompiler(serializerCompiler)
		await fastify.register(cookie)
		fastify.decorate("authenticate", async () => {})
		fastify.decorate("csrfProtection", async () => {})
		await fastify.register(authRoutes, { prefix: "/auth" })
		await fastify.ready()
	})

	it("should return success when requesting OTP with valid email", async () => {
		// Arrange
		vi.mocked(AuthService.requestOtp).mockResolvedValue()

		// Act
		const response = await fastify.inject({
			method: "POST",
			url: "/auth/request",
			payload: {
				email: "test@example.com",
			},
		})

		// Assert
		expect(response.statusCode).toBe(200)
		expect(response.json()).toEqual({
			success: true,
			message: "If the email is valid, a code was sent.",
		})
		expect(AuthService.requestOtp).toHaveBeenCalledWith("test@example.com", false)
	})

	it("should return 400 when requesting OTP with invalid email", async () => {
		// Act
		const response = await fastify.inject({
			method: "POST",
			url: "/auth/request",
			payload: {
				email: "not-an-email",
			},
		})

		// Assert
		expect(response.statusCode).toBe(400)
		expect(AuthService.requestOtp).not.toHaveBeenCalled()
	})
})
