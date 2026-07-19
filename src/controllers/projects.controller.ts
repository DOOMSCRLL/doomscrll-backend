import { FastifyReply, FastifyRequest } from "fastify"
import { getErrorResponse } from "../config/errors.js"
import { getDictionaryFor } from "../config/locales/index.js"
import { GetProjectPreviewQuery, GetReservationCountsQuery } from "../routes/projects/schemas.js"
import { ProjectsService } from "../services/projects.service.js"

export class ProjectsController {
	static async reserve(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
		const payload = request.body
		const profileId = request.user.id

		try {
			const result = await ProjectsService.reserveProject(payload, profileId)

			if ("error" in result) {
				if (result.error === "INVALID_PAYLOAD") {
					return reply.code(400).send(getErrorResponse("INVALID_PAYLOAD", undefined, (result as any).message))
				} else if (result.error === "DEADZONE_ACTIVE") {
					return reply.code(403).send(getErrorResponse("DEADZONE_ACTIVE", undefined, (result as any).message))
				} else if (result.error === "SLOT_UNAVAILABLE") {
					return reply.code(409).send(getErrorResponse("SLOT_UNAVAILABLE"))
				} else if (result.error === "COOLDOWN_ACTIVE") {
					return reply.code(429).send(getErrorResponse("COOLDOWN_ACTIVE", result.details))
				} else if (result.error === "DRAFT_LIMIT_REACHED") {
					return reply.code(409).send(getErrorResponse("DRAFT_LIMIT_REACHED"))
				} else if (result.error === "INVALID_URL") {
					return reply.code(400).send(getErrorResponse("INVALID_URL"))
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
				.send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to secure DOOMLIT reservation."))
		}
	}

	static async getUploadUrls(
		request: FastifyRequest<{ Params: { referenceId: string }; Body: { screenshotCount: number } }>,
		reply: FastifyReply,
	) {
		const { referenceId } = request.params
		const { screenshotCount } = request.body
		const profileId = request.user.id

		const dict = getDictionaryFor((request.body as any).locale).responses

		try {
			const result = await ProjectsService.getUploadUrls(referenceId, screenshotCount, profileId)

			switch (result.error) {
				case "UNAUTHORIZED":
					return reply.code(403).send(getErrorResponse("UNAUTHORIZED", undefined, dict.common.UNAUTHORIZED))
				case "INVALID_STATE":
					return reply.code(400).send(getErrorResponse("INVALID_STATE", undefined, dict.common.INVALID_STATE))
				default:
					return reply.send({ success: true, data: result.data, message: dict.getUploadUrls.SUCCESS })
			}
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, dict.getUploadUrls.INTERNAL_ERROR))
		}
	}

	static async updateProject(
		request: FastifyRequest<{ Params: { referenceId: string }; Body: any }>,
		reply: FastifyReply,
	) {
		const { referenceId } = request.params
		const payload = request.body
		const profileId = request.user.id

		const dict = getDictionaryFor((payload as any).locale).responses

		try {
			const result = await ProjectsService.updateProject(referenceId, payload, profileId)

			switch (result.error) {
				case "UNAUTHORIZED":
					return reply.code(403).send(getErrorResponse("UNAUTHORIZED", undefined, dict.common.UNAUTHORIZED))
				case "INVALID_STATE":
					return reply.code(400).send(getErrorResponse("INVALID_STATE", undefined, dict.common.INVALID_STATE))
				default:
					return reply.code(200).send({ success: true, message: dict.updateProject.SUCCESS })
			}
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, dict.updateProject.INTERNAL_ERROR))
		}
	}

	static async publishProject(request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) {
		const { referenceId } = request.params
		const profileId = request.user.id

		const dict = getDictionaryFor((request.body as any)?.locale).responses

		try {
			const result = await ProjectsService.publishProject(referenceId, profileId)

			switch (result.error) {
				case "UNAUTHORIZED":
					return reply.code(403).send(getErrorResponse("UNAUTHORIZED", undefined, dict.common.UNAUTHORIZED))
				case "INVALID_STATE":
					return reply.code(400).send(getErrorResponse("INVALID_STATE", undefined, dict.common.INVALID_STATE))
				case "VALIDATION_FAILED":
					return reply
						.code(400)
						.send(getErrorResponse("VALIDATION_FAILED", result.issues, dict.publishProject.VALIDATION_FAILED))
				default:
					return reply.code(200).send({
						success: true,
						message: dict.publishProject.SUCCESS,
					})
			}
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, dict.publishProject.INTERNAL_ERROR))
		}
	}

	static async getProjectFeed(request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) {
		try {
			const feed = await ProjectsService.getProjectFeed(request.query)
			return reply.code(200).send({ success: true, data: feed })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch daily DOOMLIT feed."))
		}
	}

	static async getProjectPreviews(
		request: FastifyRequest<{ Querystring: GetProjectPreviewQuery }>,
		reply: FastifyReply,
	) {
		const { date, category } = request.query

		const todayUtc = new Date().toISOString().split("T")[0]
		if (date <= todayUtc) {
			return reply.code(400).send(getErrorResponse("INVALID_DATE"))
		}

		try {
			const previews = await ProjectsService.getProjectPreviews(date, category)
			return reply.code(200).send({ success: true, data: previews })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch project previews."))
		}
	}

	static async getDraft(request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) {
		const { referenceId } = request.params
		const profileId = request.user.id

		try {
			const result = await ProjectsService.getDraft(referenceId, profileId)

			if (result.error === "NOT_FOUND") {
				return reply.code(404).send(getErrorResponse("NOT_FOUND", undefined, "Draft not found or unauthorized."))
			}

			return reply.code(200).send({ success: true, data: result.data })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch draft."))
		}
	}

	static async getConfirmedProjects(request: FastifyRequest, reply: FastifyReply) {
		const profileId = request.user.id

		try {
			const result = await ProjectsService.getConfirmedProjects(profileId)
			return reply.code(200).send({ success: true, data: result })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch confirmed projects."))
		}
	}

	static async getFullProject(request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) {
		const { referenceId } = request.params
		const profileId = request.user.id

		try {
			const result = await ProjectsService.getFullProject(referenceId, profileId)

			if (result.error === "NOT_FOUND") {
				return reply.code(404).send(getErrorResponse("NOT_FOUND", undefined, "Project not found or unauthorized."))
			}

			return reply.code(200).send({ success: true, data: result.data })
		} catch (error) {
			request.log.error(error)
			return reply
				.code(500)
				.send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch full project details."))
		}
	}

	static async getActiveDraftReference(request: FastifyRequest, reply: FastifyReply) {
		const profileId = request.user.id

		try {
			const result = await ProjectsService.getActiveDraftReference(profileId)

			if (result.error === "NOT_FOUND") {
				return reply.code(404).send(getErrorResponse("NOT_FOUND", undefined, "Active draft not found."))
			}

			return reply.code(200).send({ success: true, data: result.data })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch active draft."))
		}
	}

	static async cancelProject(request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) {
		const { referenceId } = request.params
		const profileId = request.user.id

		try {
			const result = await ProjectsService.cancelProject(referenceId, profileId)

			if (result.error) {
				return reply.code(400).send(getErrorResponse(result.error))
			}

			return reply.code(200).send({ success: true, message: "Project canceled." })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to cancel project."))
		}
	}

	static async getSingleProject(request: FastifyRequest<{ Params: { referenceId: string } }>, reply: FastifyReply) {
		const { referenceId } = request.params

		try {
			const project = await ProjectsService.getSingleProject(referenceId)

			if (!project) {
				return reply
					.code(404)
					.send(
						getErrorResponse("NOT_FOUND", undefined, "DOOMLIT with given reference ID is not found, or has expired."),
					)
			}

			return reply.code(200).send({ success: true, data: project })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch project details."))
		}
	}

	static async getRules(request: FastifyRequest, reply: FastifyReply) {
		try {
			const rules = ProjectsService.getRules()
			return reply.code(200).send({ success: true, data: rules })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch project rules."))
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
			return reply
				.code(500)
				.send(getErrorResponse("INTERNAL_ERROR", undefined, "Failed to fetch monthly reservation counts."))
		}
	}
}
