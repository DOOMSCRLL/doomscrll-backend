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
			getProjectPreviews: vi.fn(),
			getSingleProject: vi.fn(),
			getDraft: vi.fn(),
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
		fastify.decorate("csrfProtection", (req: any, res: any, done: any) => done())

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

	it("should get draft by referenceId", async () => {
		vi.mocked(ProjectsService.getDraft).mockResolvedValue({
			success: true,
			data: {
				referenceId: "ref123456789",
				name: "Draft Project",
				status: "draft",
				showcaseDate: "2099-12-31",
				reservedAt: new Date().toISOString(),
				authorHandle: "testuser",
			},
		} as any)

		const response = await fastify.inject({
			method: "GET",
			url: "/projects/drafts/ref123456789",
		})

		expect(response.statusCode).toBe(200)
		expect(response.json().data.name).toBe("Draft Project")
		expect(response.json().data.status).toBe("draft")
	})

	it("should parse query string properly when fetching previews", async () => {
		const mockPreviews = [
			{
				name: "Mock Previews",
				category: "Software & Tools",
				tags: ["test"],
				authorUsername: "test",
			},
		]
		vi.mocked(ProjectsService.getProjectPreviews).mockResolvedValue(mockPreviews as any)

		// 1. Properly URL-encoded space and ampersand
		const validRes = await fastify.inject({
			method: "GET",
			url: "/projects/preview?date=2099-12-31&category=Software%20%26%20Tools",
		})
		expect(validRes.statusCode).toBe(200)
		expect(ProjectsService.getProjectPreviews).toHaveBeenCalledWith("2099-12-31", "Software & Tools")

		// 2. Unencoded ampersand (will be parsed as separator, dropping 'Tools')
		const invalidRes = await fastify.inject({
			method: "GET",
			url: "/projects/preview?date=2099-12-31&category=Software & Tools",
		})
		expect(invalidRes.statusCode).toBe(200)
		expect(ProjectsService.getProjectPreviews).toHaveBeenCalledWith("2099-12-31", "Software ")
	})
})
