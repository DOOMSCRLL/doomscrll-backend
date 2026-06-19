import { describe, it, expect, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import projectRoutes from "../src/routes/projects/index.js"
import { ProjectsService } from "../src/services/projects.service.js"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"

vi.mock("../src/services/projects.service.js", () => {
	return {
		ProjectsService: {
			reserveProject: vi.fn(),
			getUploadUrls: vi.fn(),
			updateProject: vi.fn(),
			publishProject: vi.fn(),
			getProjectFeed: vi.fn(),
			getSingleProject: vi.fn(),
			getRules: vi.fn(),
			getReservationCounts: vi.fn(),
		},
	}
})

describe("Project Routes", () => {
	let fastify: ReturnType<typeof Fastify>

	beforeEach(async () => {
		vi.clearAllMocks()
		fastify = Fastify()
		fastify.setValidatorCompiler(validatorCompiler)
		fastify.setSerializerCompiler(serializerCompiler)

		fastify.decorate("authenticate", async (request: any, reply: any) => {
			request.user = { id: "test-user-id" }
		})
		fastify.decorate("csrfProtection", async () => {})

		await fastify.register(projectRoutes, { prefix: "/projects" })
		await fastify.ready()
	})

	it("should return rules configuration", async () => {
		vi.mocked(ProjectsService.getRules).mockReturnValue({
			maxReservationsPerDay: 256,
			reservationWindowDays: 14,
			cooldownPeriodDays: 14,
			draftExpirationMinutes: 15,
			deadzoneWindow: {
				start: "23:00",
				end: "00:00",
				timezone: "UTC",
			},
		} as any)

		const response = await fastify.inject({
			method: "GET",
			url: "/projects/rules",
		})

		expect(response.statusCode).toBe(200)
		expect(response.json().data.maxReservationsPerDay).toBe(256)
	})

	it("should reserve a project successfully", async () => {
		vi.mocked(ProjectsService.reserveProject).mockResolvedValue({
			success: true,
			project: { referenceId: "ref123456789" },
		} as any)

		const response = await fastify.inject({
			method: "POST",
			url: "/projects/reserve",
			payload: {
				name: "Test Project",
				category: "software",
				primaryPlatform: "web",
				primaryUrl: "https://example.com",
				showcaseDate: "2099-12-31",
			},
		})

		expect(response.statusCode).toBe(200)
		expect(response.json().data.referenceId).toBe("ref123456789")
	})

	it("should get single project", async () => {
		vi.mocked(ProjectsService.getSingleProject).mockResolvedValue({
			referenceId: "ref123456789",
			name: "Found Project",
			category: "software",
			primaryPlatform: "web",
			primaryUrl: "https://example.com",
			description: "test",
			tags: ["test"],
			features: [],
			coverImagePath: "test.webp",
			screenshotPaths: [],
			secondaryPlatforms: [],
			videoUrl: "test",
			creator: { username: "test" },
		} as any)

		const response = await fastify.inject({
			method: "GET",
			url: "/projects/ref123456789",
		})

		expect(response.statusCode).toBe(200)
		expect(response.json().data.name).toBe("Found Project")
	})
})
