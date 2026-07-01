import { FastifyReply, FastifyRequest } from "fastify"
import { ProfileService } from "../services/profile.service.js"
import { getErrorResponse } from "../config/errors.js"

export class ProfileController {
	static async getMe(request: FastifyRequest, reply: FastifyReply) {
		const userId = request.user.id
		try {
			const profile = await ProfileService.getProfileById(userId)
			if (!profile) return reply.code(404).send(getErrorResponse("NOT_FOUND", undefined, "Profile not found."))
			return reply.send({ success: true, profile })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR"))
		}
	}

	static async getPublicProfile(request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) {
		const { username } = request.params
		try {
			const profile = await ProfileService.getPublicProfileByUsername(username)
			if (!profile) return reply.code(404).send(getErrorResponse("NOT_FOUND", undefined, "Creator not found."))
			return reply.send({ success: true, profile })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR"))
		}
	}

	static async updateMe(
		request: FastifyRequest<{ Body: { username?: string; description?: string; url?: string } }>,
		reply: FastifyReply,
	) {
		const userId = request.user.id
		const updates = request.body

		try {
			const result = await ProfileService.updateProfile(userId, updates)
			if (result.error === "NO_CHANGES") {
				return reply.send({ success: true, message: "No changes provided" })
			}
			if (result.error === "USERNAME_TAKEN") {
				return reply.code(409).send(getErrorResponse("USERNAME_TAKEN"))
			}

			return reply.send({ success: true, profile: result.profile })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR"))
		}
	}

	static async deleteMe(request: FastifyRequest, reply: FastifyReply) {
		const userId = request.user.id
		try {
			const result = await ProfileService.deleteProfile(userId)
			if (result.error === "NOT_FOUND") {
				return reply.code(404).send(getErrorResponse("NOT_FOUND", undefined, "Profile not found."))
			}

			return reply
				.clearCookie("session_id", { path: "/" })
				.send({ success: true, message: "Account and all data deleted." })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send(getErrorResponse("INTERNAL_ERROR"))
		}
	}
}
