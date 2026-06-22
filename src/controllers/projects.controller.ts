import { FastifyReply, FastifyRequest } from "fastify"
import { ProjectsService } from "../services/projects.service.js"
import { GetProjectPreviewQuery, GetReservationCountsQuery } from "../routes/projects/schemas.js"

export class ProjectsController {
	static async reserve(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
		const payload = request.body
		const profileId = request.user.id

		try {
			const result = await ProjectsService.reserveProject(payload, profileId)

			if ("error" in result) {
				if (result.error === "INVALID_PAYLOAD") {
					return reply.code(400).send({
						success: false,
						error: { code: result.error, message: (result as any).message },
					})
				} else if (result.error === "DEADZONE_ACTIVE") {
					return reply.code(403).send({
						success: false,
						error: { code: result.error, message: (result as any).message },
					})
				} else if (result.error === "SLOT_UNAVAILABLE") {
					return reply.code(409).send({
						success: false,
						error: { code: "SLOT_UNAVAILABLE", message: "All DOOMLITs have been reserved for this date." },
					})
				} else if (result.error === "COOLDOWN_ACTIVE") {
					return reply.code(429).send({
						success: false,
						error: {
							code: "COOLDOWN_ACTIVE",
							message: "A project can not be re-showcased before 14 days since it's showcase date.",
							details: result.details,
						},
					})
				}
			}

			if ("success" in result) {
				return reply.code(200).send({
					success: true,
					data: {
						referenceId: result.project?.referenceId,
						message:
							"DOOMLIT draft have been saved, and slot will be reserved for 15 minutes. If payment isn't completed by that period, project details will be removed.",
					},
				})
			}
		} catch (error) {
			request.log.error(error)
			return reply
				.code(500)
				.send({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to secure DOOMLIT reservation." } })
		}
	}

	static async getUploadUrls(
		request: FastifyRequest<{ Params: { referenceId: string }; Body: { screenshotCount: number } }>,
		reply: FastifyReply,
	) {
		const { referenceId } = request.params
		const { screenshotCount } = request.body
		const profileId = request.user.id

		try {
			const result = await ProjectsService.getUploadUrls(referenceId, screenshotCount, profileId)

			if (result.error === "UNAUTHORIZED") {
				return reply.code(403).send({ success: false, error: "Unauthorized access" })
			} else if (result.error === "INVALID_STATE") {
				return reply.code(400).send({ success: false, error: "Project is not awaiting content." })
			}

			return reply.send({ success: true, data: result.data })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Failed to generate upload URLs." })
		}
	}

	static async updateProject(
		request: FastifyRequest<{ Params: { referenceId: string }; Body: any }>,
		reply: FastifyReply,
	) {
		const { referenceId } = request.params
		const payload = request.body
		const profileId = request.user.id

		try {
			const result = await ProjectsService.updateProject(referenceId, payload, profileId)

			if (result.error === "UNAUTHORIZED") {
				return reply.code(403).send({ success: false, error: "Unauthorized access" })
			} else if (result.error === "INVALID_STATE") {
				return reply.code(400).send({ success: false, error: "Project is not awaiting content." })
			}

			return reply.code(200).send({ success: true, message: "Project details are updated." })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Failed to save project content." })
		}
	}

	static async publishProject(request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) {
		const { referenceId } = request.params
		const profileId = request.user.id

		try {
			const result = await ProjectsService.publishProject(referenceId, profileId)

			switch (result.error) {
				case "UNAUTHORIZED":
					return reply.code(403).send({ success: false, error: "Unauthorized access" })
				case "INVALID_STATE":
					return reply.code(400).send({ success: false, error: "Project is not awaiting content." })
				case "VALIDATION_FAILED":
					return reply.code(400).send({
						success: false,
						message: "Missing or invalid required fields.",
						errors: result.issues,
					})
				default:
					return reply.code(200).send({
						success: true,
						message: "Project is ready for showcase.",
					})
			}
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Failed to publish project." })
		}
	}

	static async getProjectFeed(request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) {
		try {
			const feed = await ProjectsService.getProjectFeed(request.query)
			return reply.code(200).send({ success: true, data: feed })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Failed to fetch daily DOOMLIT feed." })
		}
	}

	static async getProjectPreviews(
		request: FastifyRequest<{ Querystring: GetProjectPreviewQuery }>,
		reply: FastifyReply,
	) {
		const { date } = request.query

		const todayUtc = new Date().toISOString().split("T")[0]
		if (date <= todayUtc) {
			return reply.code(400).send({
				success: false,
				error: { code: "INVALID_DATE", message: "Queried date must be in the future." },
			})
		}

		try {
			const previews = await ProjectsService.getProjectPreviews(date)
			return reply.code(200).send({ success: true, data: previews })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({
				success: false,
				error: { code: "INTERNAL_ERROR", message: "Failed to fetch project previews." },
			})
		}
	}

	static async getSingleProject(request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) {
		const { referenceId } = request.params

		try {
			const project = await ProjectsService.getSingleProject(referenceId)

			if (!project) {
				return reply
					.code(404)
					.send({ success: false, error: `DOOMLIT with given reference ID is not found, or has expired.` })
			}

			return reply.code(200).send({ success: true, data: project })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Failed to fetch project details." })
		}
	}

	static async getRules(request: FastifyRequest, reply: FastifyReply) {
		try {
			const rules = ProjectsService.getRules()
			return reply.code(200).send({ success: true, data: rules })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({
				success: false,
				error: { code: "INTERNAL_ERROR", message: "Failed to fetch project rules." },
			})
		}
	}

	static async getReservationCounts(
		request: FastifyRequest<{ Querystring: GetReservationCountsQuery }>,
		reply: FastifyReply,
	) {
		const { year, month } = request.query

		try {
			const result = await ProjectsService.getReservationCounts(year, month)
			return reply.code(200).send({ success: true, data: result })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({
				success: false,
				error: { code: "INTERNAL_ERROR", message: "Failed to fetch monthly reservation counts." },
			})
		}
	}
}
