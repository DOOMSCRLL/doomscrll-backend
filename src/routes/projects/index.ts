import { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"

import { DB_RULES } from "../../config/index.js"
import { ProjectsController } from "../../controllers/projects.controller.js"
import {
	apiErrorResponseSchema,
	getProjectFeedQuerySchema,
	getProjectPreviewQuerySchema,
	getProjectPreviewResponseSchema,
	getDraftResponseSchema,
	getProjectRulesResponseSchema,
	getReservationCountsQuerySchema,
	getReservationCountsResponseSchema,
	getSingleProjectParamsSchema,
	patchContentSchema,
	reserveProjectSchema,
} from "./schemas.js"

export const projectRoutes: FastifyPluginAsyncZod = async (fastify) => {
	// #region Public routes
	fastify.register(async (publicRoutes) => {
		publicRoutes.get(
			"/",
			{
				schema: { querystring: getProjectFeedQuerySchema },
				config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
			},
			ProjectsController.getProjectFeed,
		)

		publicRoutes.get(
			"/preview",
			{
				schema: {
					querystring: getProjectPreviewQuerySchema,
					response: { 200: getProjectPreviewResponseSchema, 400: apiErrorResponseSchema, 500: apiErrorResponseSchema },
				},
				config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
			},
			ProjectsController.getProjectPreviews,
		)

		publicRoutes.get(
			"/:referenceId",
			{
				schema: { params: getSingleProjectParamsSchema },
				config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
			},
			ProjectsController.getSingleProject,
		)

		publicRoutes.get(
			"/rules",
			{
				schema: {
					response: {
						200: getProjectRulesResponseSchema,
						500: apiErrorResponseSchema,
					},
				},
				config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
			},
			ProjectsController.getRules,
		)

		publicRoutes.get(
			"/reservation-counts",
			{
				schema: {
					querystring: getReservationCountsQuerySchema,
					response: { 200: getReservationCountsResponseSchema, 500: apiErrorResponseSchema },
				},
				config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
			},
			ProjectsController.getReservationCounts,
		)
	})
	// #endregion

	// #region Private routes
	fastify.register(async (privateRoutes) => {
		privateRoutes.addHook("preHandler", fastify.authenticate)
		privateRoutes.addHook("preHandler", (request, reply, done) => {
			if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
				fastify.csrfProtection(request, reply, done)
			} else {
				done()
			}
		})

		privateRoutes.get(
			"/drafts/active",
			{
				schema: {
					response: {
						200: z.object({ success: z.boolean(), data: z.object({ referenceId: z.string(), reservedAt: z.any() }) }),
						404: apiErrorResponseSchema,
						500: apiErrorResponseSchema,
					},
				},
			},
			ProjectsController.getActiveDraftReference,
		)

		privateRoutes.get(
			"/drafts/:referenceId",
			{
				schema: {
					params: getSingleProjectParamsSchema,
					response: {
						200: getDraftResponseSchema,
						404: apiErrorResponseSchema,
						500: apiErrorResponseSchema,
					},
				},
			},
			ProjectsController.getDraft,
		)

		privateRoutes.delete(
			"/:referenceId",
			{
				schema: {
					params: getSingleProjectParamsSchema,
					response: {
						200: z.object({ success: z.boolean(), message: z.string() }),
						404: apiErrorResponseSchema,
						500: apiErrorResponseSchema,
					},
				},
			},
			ProjectsController.cancelProject,
		)

		privateRoutes.post("/reserve", { schema: { body: reserveProjectSchema } }, ProjectsController.reserve)

		privateRoutes.post(
			"/:referenceId/upload-urls",
			{
				schema: {
					params: z.object({ referenceId: z.string().length(12) }),
					body: z.object({ screenshotCount: z.number().int().min(0).max(DB_RULES.limitScreenshots) }),
				},
			},
			ProjectsController.getUploadUrls,
		)

		privateRoutes.patch(
			"/:referenceId",
			{
				schema: {
					params: z.object({
						referenceId: z.string().length(DB_RULES.lengthProjectRefId + DB_RULES.prefixProjectRefId.length),
					}),
					body: patchContentSchema,
				},
			},
			ProjectsController.updateProject,
		)

		privateRoutes.post(
			"/:referenceId/publish",
			{
				schema: {
					params: z.object({
						referenceId: z.string().length(DB_RULES.lengthProjectRefId + DB_RULES.prefixProjectRefId.length),
					}),
				},
			},
			ProjectsController.publishProject,
		)
	})
	// #endregion
}

export default projectRoutes
