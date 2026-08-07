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
			getConfirmedProjects: vi.fn(),
			getFullProject: vi.fn(),
			getDraft: vi.fn(),
			cancelProject: vi.fn(),
			getRules: vi.fn(),
			getProjectsPerCategory: vi.fn(),
			getReservationCounts: vi.fn(),
			rescheduleProject: vi.fn(),
			refundProject: vi.fn(),
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

		fastify.decorate("authenticate", async (request: any) => {
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
			maxTagCount: 3,
			maxScreenshotCount: 8,
			maxImageFileSizeMB: 5,
			maxLengthProjectName: 50,
			maxLengthProjectDescription: 300,
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
				createdAt: new Date().toISOString(),
				authorHandle: "testuser",
				category: "software",
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

	it("should return 404 when draft is not found or not in draft status", async () => {
		vi.mocked(ProjectsService.getDraft).mockResolvedValue({ error: "NOT_FOUND" } as any)

		const response = await fastify.inject({
			method: "GET",
			url: "/projects/drafts/ref123456789",
		})

		expect(response.statusCode).toBe(404)
	})

	it("should get confirmed projects", async () => {
		vi.mocked(ProjectsService.getConfirmedProjects).mockResolvedValue([
			{ referenceId: "ref123", category: "software", name: "test", showcaseDate: "2099-12-31", status: "incomplete" },
		] as any)

		const res = await fastify.inject({ method: "GET", url: "/projects/me" })
		expect(res.statusCode).toBe(200)
		expect(res.json().data.length).toBe(1)
		expect(res.json().data[0].referenceId).toBe("ref123")
	})

	it("should get full project details", async () => {
		vi.mocked(ProjectsService.getFullProject).mockResolvedValue({
			success: true,
			data: {
				referenceId: "ref123456789",
				name: "Full Project",
				category: "software",
				primaryPlatform: "web",
				primaryUrl: "https://example.com",
				showcaseDate: "2099-12-31",
				status: "incomplete",
				reservedAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				description: "test desc",
				tags: ["#test"],
				features: null,
				coverImagePath: null,
				screenshotPaths: null,
				secondaryPlatforms: null,
				videoUrl: null,
			},
		} as any)

		const res = await fastify.inject({ method: "GET", url: "/projects/me/ref123456789" })
		expect(res.statusCode).toBe(200)
		expect(res.json().data.name).toBe("Full Project")
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

	it("should get project feed", async () => {
		vi.mocked(ProjectsService.getProjectFeed).mockResolvedValue({
			feed: [{ referenceId: "ref1", name: "Project 1", creator: { username: "user1" } }],
		} as any)

		const res = await fastify.inject({ method: "GET", url: "/projects?page=1&batchSize=10" })
		expect(res.statusCode).toBe(200)
		expect(res.json().data.length).toBe(1)
	})

	it("should get projects per category count", async () => {
		vi.mocked(ProjectsService.getProjectsPerCategory).mockResolvedValue([
			{ category: "Video Games", count: 5 },
			{ category: "Software & Tools", count: 2 },
		] as any)

		const res = await fastify.inject({
			method: "GET",
			url: "/projects/projects-per-category?date=2026-08-02",
		})
		expect(res.statusCode).toBe(200)
		expect(res.json().data).toEqual([
			{ category: "Video Games", count: 5 },
			{ category: "Software & Tools", count: 2 },
		])
		expect(ProjectsService.getProjectsPerCategory).toHaveBeenCalledWith("2026-08-02")
	})

	it("should get reservation counts", async () => {
		vi.mocked(ProjectsService.getReservationCounts).mockResolvedValue({
			meta: { year: 2026, month: 7, maxReservationsPerDay: 256 },
			counts: { "2026-07-01": 5 },
		} as any)

		const res = await fastify.inject({ method: "GET", url: "/projects/reservation-counts?year=2026&month=7" })
		expect(res.statusCode).toBe(200)
		expect(res.json().data.counts["2026-07-01"]).toBe(5)
	})

	it("should cancel project", async () => {
		vi.mocked(ProjectsService.cancelProject).mockResolvedValue({ success: true } as any)

		const res = await fastify.inject({ method: "DELETE", url: "/projects/ref123456789" })
		expect(res.statusCode).toBe(200)
	})

	it("should return error if cancelling unknown project", async () => {
		vi.mocked(ProjectsService.cancelProject).mockResolvedValue({ error: "NOT_FOUND" } as any)
		const res = await fastify.inject({ method: "DELETE", url: "/projects/ref123456789" })
		expect(res.statusCode).toBe(400)
		expect(res.json().error.code).toBe("NOT_FOUND")
	})

	it("should get upload urls", async () => {
		vi.mocked(ProjectsService.getUploadUrls).mockResolvedValue({
			success: true,
			data: { cover: { uploadUrl: "url", path: "path" }, screenshots: [] },
		} as any)

		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/upload-urls",
			payload: { screenshotCount: 1 },
		})
		expect(res.statusCode).toBe(200)
	})

	it("should patch project", async () => {
		vi.mocked(ProjectsService.updateProject).mockResolvedValue({ success: true } as any)
		const res = await fastify.inject({
			method: "PATCH",
			url: "/projects/ref123456789",
			payload: { description: "new desc" },
		})
		expect(res.statusCode).toBe(200)
	})

	it("should publish project", async () => {
		vi.mocked(ProjectsService.publishProject).mockResolvedValue({ success: true } as any)
		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/publish",
			payload: {},
		})
		expect(res.statusCode).toBe(200)
	})

	it("should reschedule project successfully", async () => {
		vi.mocked(ProjectsService.rescheduleProject).mockResolvedValue({ success: true } as any)
		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/reschedule",
			payload: { newDate: "2099-12-31" },
		})
		expect(res.statusCode).toBe(200)
		expect(res.json().success).toBe(true)
	})

	it("should fail to reschedule project if validation fails", async () => {
		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/reschedule",
			payload: { newDate: "invalid" },
		})
		expect(res.statusCode).toBe(400)
	})

	it("should fail to reschedule project if unauthorized", async () => {
		vi.mocked(ProjectsService.rescheduleProject).mockResolvedValue({ error: "UNAUTHORIZED" } as any)
		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/reschedule",
			payload: { newDate: "2099-12-31" },
		})
		expect(res.statusCode).toBe(403)
	})

	it("should refund project successfully", async () => {
		vi.mocked(ProjectsService.refundProject).mockResolvedValue({ success: true } as any)
		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/refund",
		})
		expect(res.statusCode).toBe(200)
		expect(res.json().success).toBe(true)
	})

	it("should fail to refund project if unauthorized or not found", async () => {
		vi.mocked(ProjectsService.refundProject).mockResolvedValue({ error: "NOT_FOUND" } as any)
		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/refund",
		})
		expect(res.statusCode).toBe(404)
	})

	it("should fail to refund project if deadzone is active", async () => {
		vi.mocked(ProjectsService.refundProject).mockResolvedValue({ error: "DEADZONE_ACTIVE" } as any)
		const res = await fastify.inject({
			method: "POST",
			url: "/projects/ref123456789/refund",
		})
		expect(res.statusCode).toBe(403)
	})
})
