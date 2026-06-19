import { S3Client } from "@aws-sdk/client-s3"

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

if (!accountId || !accessKeyId || !secretAccessKey) {
	throw new Error("[FATAL] INTERNAL_ERROR: Missing Cloudflare R2 related environment variables.")
}

export const r2Client = new S3Client({
	region: "auto",
	endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId,
		secretAccessKey,
	},
})

export const BUCKET_NAME = process.env.R2_BUCKET_NAME
