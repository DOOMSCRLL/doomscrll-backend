import { describe, it, expect, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import profileRoutes from "../src/routes/profile/index.js"
import { ProfileService } from "../src/services/profile.service.js"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import cookie from "@fastify/cookie"

vi.mock("../src/services/profile.service.js", () => {
	return {
		ProfileService: {
			getProfileById: vi.fn(),
			getPublicProfileByUsername: vi.fn(),
			updateProfile: vi.fn(),
			deleteProfile: vi.fn(),
		},
	}
})

describe("Profile Routes", () => {
	let fastify: ReturnType<typeof Fastify>

	beforeEach(async () => {
		vi.clearAllMocks()
		fastify = Fastify()
		fastify.setValidatorCompiler(validatorCompiler)
		fastify.setSerializerCompiler(serializerCompiler)
		await fastify.register(cookie)

		fastify.decorate("authenticate", async (request: any) => {
			request.user = { id: "test-user-id" }
		})
		fastify.decorate("csrfProtection", (req: any, res: any, done: any) => done())

		await fastify.register(profileRoutes, { prefix: "/profile" })
		await fastify.ready()
	})

	it("should get public profile", async () => {
		vi.mocked(ProfileService.getPublicProfileByUsername).mockResolvedValue({ username: "testuser" } as any)

		const response = await fastify.inject({
			method: "GET",
			url: "/profile/testuser",
		})

		expect(response.statusCode).toBe(200)
		expect(ProfileService.getPublicProfileByUsername).toHaveBeenCalledWith("testuser")
	})

	it("should get me", async () => {
		vi.mocked(ProfileService.getProfileById).mockResolvedValue({ id: "test-user-id" } as any)

		const response = await fastify.inject({
			method: "GET",
			url: "/profile/me",
		})

		expect(response.statusCode).toBe(200)
		expect(ProfileService.getProfileById).toHaveBeenCalledWith("test-user-id")
	})

	it("should update me", async () => {
		vi.mocked(ProfileService.updateProfile).mockResolvedValue({
			success: true,
			profile: { username: "new_name" },
		} as any)

		const response = await fastify.inject({
			method: "PATCH",
			url: "/profile/me",
			payload: {
				username: "new_name",
			},
		})

		expect(response.statusCode).toBe(200)
		expect(ProfileService.updateProfile).toHaveBeenCalledWith("test-user-id", { username: "new_name" })
	})

	it("should fail update me if username taken", async () => {
		vi.mocked(ProfileService.updateProfile).mockResolvedValue({
			error: "USERNAME_TAKEN",
		} as any)

		const response = await fastify.inject({
			method: "PATCH",
			url: "/profile/me",
			payload: { username: "taken" },
		})

		expect(response.statusCode).toBe(409)
		expect(response.json().error.code).toBe("USERNAME_TAKEN")
	})

	it("should delete me", async () => {
		vi.mocked(ProfileService.deleteProfile).mockResolvedValue({ success: true } as any)

		const response = await fastify.inject({
			method: "DELETE",
			url: "/profile/me",
		})

		expect(response.statusCode).toBe(200)
		expect(response.json().success).toBe(true)
		expect(ProfileService.deleteProfile).toHaveBeenCalledWith("test-user-id")
	})
})
