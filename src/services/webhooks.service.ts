import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { projectLedger, projects, receipts } from "../db/schema.js"

export class WebhooksService {
	static async processPaymentWebhook(rawBody: string, signature: string) {
		let payload: Record<string, any>
		try {
			payload = JSON.parse(rawBody)
		} catch (error) {
			return { error: "MALFORMED_JSON" as const, message: String(error) }
		}

		const secret = process.env.WEBHOOK_SECRET

		if (secret) {
			const hmac = crypto.createHmac("sha256", secret)
			const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8")
			const signatureBuffer = Buffer.from(signature, "utf8")

			if (digest.length !== signatureBuffer.length || !crypto.timingSafeEqual(digest, signatureBuffer)) {
				return { error: "INVALID_SIGNATURE" as const }
			}
		}

		const projectReferenceId =
			payload?.projectReferenceId ||
			payload?.meta?.custom_data?.project_reference_id ||
			payload?.custom_data?.project_reference_id

		const priceCents = payload?.priceCents ?? payload?.data?.attributes?.total ?? 0
		const transactionId = payload?.transactionId || payload?.data?.id || `tx_${Date.now()}`
		const receiptUrl = payload?.receiptUrl || payload?.data?.attributes?.urls?.receipt || null
		const provider = payload?.provider || "payment_gateway"

		if (!projectReferenceId) {
			return { error: "MISSING_REFERENCE_ID" as const }
		}

		await db.transaction(async (tx) => {
			const [data] = await tx
				.select({
					project: projects,
					ledger: projectLedger,
				})
				.from(projects)
				.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
				.where(eq(projects.referenceId, projectReferenceId))

			if (!data) {
				tx.rollback()
				throw new Error(`Project ${projectReferenceId} not found.`)
			}
			if (data.project.status !== "draft") {
				tx.rollback()
				throw new Error(`Project ${projectReferenceId} already processed or its state is invalid.`)
			}

			await tx.update(projects).set({ status: "incomplete" }).where(eq(projects.id, data.project.id))

			await tx
				.update(projectLedger)
				.set({ lastShowcaseDate: data.project.showcaseDate })
				.where(eq(projectLedger.id, data.ledger.id))

			await tx.insert(receipts).values({
				profileId: data.ledger.profileId,
				ledgerId: data.ledger.id,
				projectReferenceId: data.project.referenceId,
				showcaseDate: data.project.showcaseDate,
				priceCents: priceCents,
				provider: provider,
				providerTransactionId: transactionId,
				receiptUrl: receiptUrl,
				status: "succeeded",
			})
		})

		return { success: true as const, projectReferenceId }
	}
}
